import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseOMRImageData, STREAM_POS, GRID_ORIGIN, COL_STEP, ROW_STEP } from "@/lib/omr-utils";
import jsQR from "jsqr";
import type { Student } from "@shared/schema";

interface LiveOMRScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    students: Student[];
    onSaveData: (studentId: string, stream: string, choices: string[]) => void;
}

export function LiveOMRScannerModal({ isOpen, onClose, students, onSaveData }: LiveOMRScannerModalProps) {
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const [isScanning, setIsScanning] = useState(false);
    const [cameraOk, setCameraOk] = useState<boolean | null>(null);
    const [lockedStudent, setLockedStudent] = useState<Student | null>(null);
    const [scanData, setScanData] = useState<{ stream: string | null, choices: string[] } | null>(null);
    
    // Stability tracking (require 3 consecutive identical frames to lock on)
    const stabilityCounter = useRef(0);
    const lastResultStr = useRef("");

    // Start Webcam
    useEffect(() => {
        let stream: MediaStream | null = null;
        if (isOpen) {
            // Browsers permanently disable the Camera API if the site is not loaded over HTTPS or localhost
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.error("Camera API unavailable: Connection is likely insecure (requires HTTPS or localhost).");
                setCameraOk(false);
                return;
            }

            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } })
                .then(s => {
                    stream = s;
                    if (videoRef.current) {
                        videoRef.current.srcObject = s;
                        videoRef.current.play();
                    }
                    setCameraOk(true);
                    setIsScanning(true);
                    stabilityCounter.current = 0;
                    setLockedStudent(null);
                    setScanData(null);
                })
                .catch(err => {
                    console.error("Camera error:", err);
                    setCameraOk(false);
                });
        }
        return () => {
            setIsScanning(false);
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, [isOpen]);

    const processFrame = useCallback(async () => {
        if (!isScanning || !videoRef.current || !hiddenCanvasRef.current || !overlayCanvasRef.current) return;

        const video = videoRef.current;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            requestAnimationFrame(processFrame);
            return;
        }

        const width = video.videoWidth;
        const height = video.videoHeight;

        // Set canvases physical DOM dimensions to match exact video resolution tightly
        hiddenCanvasRef.current.width = width;
        hiddenCanvasRef.current.height = height;
        overlayCanvasRef.current.width = width;
        overlayCanvasRef.current.height = height;

        const ctx = hiddenCanvasRef.current.getContext('2d', { willReadFrequently: true });
        const overCtx = overlayCanvasRef.current.getContext('2d');
        if (!ctx || !overCtx) return;

        // Draw current video frame to hidden canvas
        ctx.drawImage(video, 0, 0, width, height);
        const imgData = ctx.getImageData(0, 0, width, height);

        // Clear overlay for fresh redrawing
        overCtx.clearRect(0, 0, width, height);

        // Draw "Hold Paper Here" Guide Box
        // Perfect A4 aspect ratio is 1:1.414. We want to take up 80% of the screen height.
        const guideHeight = height * 0.8;
        const guideWidth = guideHeight / 1.414;
        const guideX = (width - guideWidth) / 2;
        const guideY = (height - guideHeight) / 2;
        
        // Draw the white stencil mask covering everything OUTSIDE the guide
        overCtx.fillStyle = "rgba(255, 255, 255, 0.65)";
        overCtx.beginPath();
        overCtx.rect(0, 0, width, height); // Outer full screen
        overCtx.rect(guideX, guideY, guideWidth, guideHeight); // Inner guide hole
        overCtx.fill("evenodd"); // Subtractive hole punch using evenodd winding rule
        
        // Draw dashed guide boundary
        overCtx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        overCtx.lineWidth = 2;
        overCtx.setLineDash([15, 15]);
        overCtx.strokeRect(guideX, guideY, guideWidth, guideHeight);
        overCtx.setLineDash([]);
        
        // Add corner brackets for the guide
        overCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        overCtx.lineWidth = 4;
        const cl = 30; // corner length
        // Top Left
        overCtx.beginPath(); overCtx.moveTo(guideX, guideY + cl); overCtx.lineTo(guideX, guideY); overCtx.lineTo(guideX + cl, guideY); overCtx.stroke();
        // Top Right
        overCtx.beginPath(); overCtx.moveTo(guideX + guideWidth - cl, guideY); overCtx.lineTo(guideX + guideWidth, guideY); overCtx.lineTo(guideX + guideWidth, guideY + cl); overCtx.stroke();
        // Bottom Left
        overCtx.beginPath(); overCtx.moveTo(guideX, guideY + guideHeight - cl); overCtx.lineTo(guideX, guideY + guideHeight); overCtx.lineTo(guideX + cl, guideY + guideHeight); overCtx.stroke();
        // Bottom Right
        overCtx.beginPath(); overCtx.moveTo(guideX + guideWidth - cl, guideY + guideHeight); overCtx.lineTo(guideX + guideWidth, guideY + guideHeight); overCtx.lineTo(guideX + guideWidth, guideY + guideHeight - cl); overCtx.stroke();

        try {
            // STEP 1: Fast QR Scan first to avoid heavy OMR processing on random frames
            // Using "attemptBoth" is critical for webcams due to variable contrast/shadows
            const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "attemptBoth" });
            if (!code) {
                // Keep trying
                requestAnimationFrame(processFrame);
                return;
            }

            // Draw Green Box around QR code indicating detection
            overCtx.strokeStyle = "#22c55e"; // green-500
            overCtx.lineWidth = 4;
            overCtx.beginPath();
            overCtx.moveTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
            overCtx.lineTo(code.location.topRightCorner.x, code.location.topRightCorner.y);
            overCtx.lineTo(code.location.bottomRightCorner.x, code.location.bottomRightCorner.y);
            overCtx.lineTo(code.location.bottomLeftCorner.x, code.location.bottomLeftCorner.y);
            overCtx.closePath();
            overCtx.stroke();

            // Locate Student
            let detectedStudent: Student | null = null;
            try {
                const qrPayload = JSON.parse(code.data);
                if (qrPayload.id) {
                    detectedStudent = students.find(s => s.id === qrPayload.id) || null;
                }
            } catch (e) {
                // Invalid Payload 
            }

            if (!detectedStudent) {
                requestAnimationFrame(processFrame);
                return;
            }

            // STEP 2: Use the physical coordinates of the QR code in the video frame to establish a planar Anchor
            // The QR code printed by omrService is 90x90 physically
            const dx = code.location.topRightCorner.x - code.location.topLeftCorner.x;
            const dy = code.location.topRightCorner.y - code.location.topLeftCorner.y;
            const qrPxWidth = Math.sqrt(dx * dx + dy * dy);
            
            // Avoid division by zero on corrupted reads
            if (qrPxWidth < 10) {
                requestAnimationFrame(processFrame);
                return;
            }
            
            const scale = qrPxWidth / 90.0;
            const angle = Math.atan2(dy, dx);
            
            const anchor = {
                scale,
                angle,
                qrX: code.location.topLeftCorner.x,
                qrY: code.location.topLeftCorner.y,
                qrPhysicalX: 455.28,
                qrPhysicalY: 80.0
            };

            // STEP 3: Full OMR extraction
            const parsedOMR = await parseOMRImageData(imgData, 0, 0, false, undefined, undefined, anchor);
            const { markerTL, markerTR, markerBL, markerBR, toPixel, selectedStream, choices } = parsedOMR;

            // Paint Blue Crosshairs where Center of Mass located Fiducials
            if (markerTL && markerTR && markerBL && markerBR) {
                overCtx.strokeStyle = "blue";
                overCtx.lineWidth = 3;
                const drawCrosshair = (point: { x: number, y: number }) => {
                    overCtx.beginPath();
                    overCtx.arc(point.x, point.y, 10, 0, 2 * Math.PI);
                    overCtx.stroke();
                    overCtx.beginPath();
                    overCtx.moveTo(point.x - 15, point.y);
                    overCtx.lineTo(point.x + 15, point.y);
                    overCtx.moveTo(point.x, point.y - 15);
                    overCtx.lineTo(point.x, point.y + 15);
                    overCtx.stroke();
                };
                drawCrosshair(markerTL);
                drawCrosshair(markerTR);
                drawCrosshair(markerBL);
                drawCrosshair(markerBR);

                // Draw bounding box interconnecting the 4 fiducials
                overCtx.strokeStyle = "rgba(0, 0, 255, 0.4)";
                overCtx.setLineDash([10, 10]);
                overCtx.beginPath();
                overCtx.moveTo(markerTL.x, markerTL.y);
                overCtx.lineTo(markerTR.x, markerTR.y);
                overCtx.lineTo(markerBR.x, markerBR.y);
                overCtx.lineTo(markerBL.x, markerBL.y);
                overCtx.closePath();
                overCtx.stroke();
                overCtx.setLineDash([]);
            }

            if (toPixel) {
                // Overlay theoretical extraction matrix
                overCtx.strokeStyle = "red";
                overCtx.lineWidth = 2;
                
                // Red Matrix
                for (let r = 0; r < 10; r++) {
                    for (let c = 0; c < 10; c++) {
                        const p = toPixel(GRID_ORIGIN.x + c * COL_STEP, GRID_ORIGIN.y + r * ROW_STEP);
                        overCtx.beginPath();
                        overCtx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
                        overCtx.stroke();
                        
                        // If selected, fill it
                        if (choices[c] === DISTRICTS[r]) {
                            overCtx.fillStyle = "rgba(255, 0, 0, 0.5)";
                            overCtx.fill();
                        }
                    }
                }
                
                // Pink Streams
                overCtx.strokeStyle = "magenta";
                for (const pos of STREAM_POS) {
                    const p = toPixel(pos.x, pos.y);
                    overCtx.beginPath();
                    overCtx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
                    overCtx.stroke();
                }
            }

            // Stabilizer Check: Do we have all 10 choices and a stream?
            const validChoices = choices.filter(c => c && c.trim() !== "").length;
            if (selectedStream && validChoices > 0) {
                const resultHash = `${detectedStudent.id}-${selectedStream}-${choices.join("-")}`;
                if (resultHash === lastResultStr.current) {
                    stabilityCounter.current++;
                } else {
                    lastResultStr.current = resultHash;
                    stabilityCounter.current = 1;
                }

                // If locked stably for 5 frames, STOP processing and present result
                if (stabilityCounter.current >= 5) {
                    setLockedStudent(detectedStudent);
                    setScanData({ stream: selectedStream, choices });
                    setIsScanning(false);
                    return; // EXIT LOOP
                }
            }

        } catch (err) {
            // Ignore frame errors and continue loop
        }

        // Loop next frame
        requestAnimationFrame(processFrame);
    }, [isScanning, students]);

    // Trigger loop when scanning states becomes true
    useEffect(() => {
        if (isScanning && cameraOk) {
            requestAnimationFrame(processFrame);
        }
    }, [isScanning, cameraOk, processFrame]);

    const handleConfirm = () => {
        if (lockedStudent && scanData && scanData.stream) {
            onSaveData(lockedStudent.id.toString(), scanData.stream, scanData.choices);
            toast({ title: "Saved", description: `Data for ${lockedStudent.name} saved successfully.` });
            
            // Resume scanning immediately for the next paper
            setLockedStudent(null);
            setScanData(null);
            lastResultStr.current = "";
            stabilityCounter.current = 0;
            setIsScanning(true);
        }
    };

    const handleReject = () => {
        // Resume scanning
        setLockedStudent(null);
        setScanData(null);
        lastResultStr.current = "";
        stabilityCounter.current = 0;
        setIsScanning(true);
    };

    const DISTRICTS = [
        "Amritsar", "Bathinda", "Ferozepur", "Gurdaspur", "Jalandhar",
        "Ludhiana", "Patiala", "SAS Nagar (Mohali)", "Sangrur", "Talwara",
    ];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) onClose();
        }}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Live Real-Time OMR Scanner</DialogTitle>
                    <DialogDescription>
                        Hold the printed A4 physical OMR sheet up to your camera. Make sure all 4 black corner squares are visible.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border">
                    {cameraOk === false && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 p-6 text-center bg-zinc-900 border-2 border-red-500 rounded-lg z-50">
                            <AlertCircle className="w-12 h-12 mb-3" />
                            <p className="text-lg font-bold">Camera Access Unavailable</p>
                            {(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) ? (
                                <div className="text-sm mt-3 text-red-100 bg-red-950/50 p-4 rounded-md inline-block text-left max-w-lg">
                                    <p className="mb-2">Your browser has blocked the hardware camera because this connection is <strong>not secure (HTTP)</strong>.</p>
                                    <p>Mobile browsers absolutely restrict camera access when connecting to local IP addresses (like <code>192.168...</code>) unless you use an HTTPS tunnel.</p>
                                </div>
                            ) : (
                                <p className="text-sm mt-2 text-zinc-400">Please grant camera permissions when prompted and ensure no other app is using it.</p>
                            )}
                        </div>
                    )}
                    
                    <video 
                        ref={videoRef} 
                        playsInline 
                        muted 
                        className={`w-full h-full object-contain ${!isScanning && lockedStudent ? 'filter blur-sm opacity-50' : ''}`}
                    />
                    
                    {/* Hidden canvas for data extraction */}
                    <canvas ref={hiddenCanvasRef} className="hidden" />
                    
                    {/* Overlay canvas for live drawing Blue and Red visual feedback */}
                    <canvas 
                        ref={overlayCanvasRef} 
                        className={`absolute top-0 left-0 w-full h-full object-contain pointer-events-none transition-opacity duration-200 ${!isScanning && lockedStudent ? 'opacity-0' : 'opacity-100'}`}
                    />

                    {/* HUD: Scanning Indicator */}
                    {isScanning && cameraOk && (
                        <div className="absolute top-4 right-4 bg-black/60 px-3 py-1.5 rounded-full flex items-center space-x-2 border border-white/20">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs font-semibold text-white tracking-widest uppercase">Scanning</span>
                        </div>
                    )}

                    {/* Final Result Modal Overlay */}
                    {!isScanning && lockedStudent && scanData && (
                        <div className="absolute inset-x-8 inset-y-8 bg-white/95 text-black rounded-xl shadow-2xl p-6 flex flex-col justify-center border-2 border-primary/20 backdrop-blur-md animate-in zoom-in-95 duration-200">
                            <div className="flex items-center space-x-3 mb-6">
                                <CheckCircle2 className="w-10 h-10 text-green-500" />
                                <div>
                                    <h3 className="text-xl font-bold">Stable Lock Acquired</h3>
                                    <p className="text-sm text-zinc-600">Student: <strong>{lockedStudent.name}</strong> (Merit #: {lockedStudent.meritNumber})</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 flex-1 overflow-auto bg-slate-50 p-4 border rounded-lg">
                                <div>
                                    <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-2">Detected Stream</h4>
                                    <p className="text-lg font-bold text-primary">{scanData.stream === "Non-Medical" ? "NonMedical" : scanData.stream}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-2">Detected Choices</h4>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                                        {scanData.choices.map((c, i) => (
                                            <div key={i} className="flex">
                                                <span className="w-6 text-zinc-400 font-mono">{i + 1}.</span>
                                                <span className={c ? 'font-medium' : 'text-rose-500 italic text-xs'}>{c || "Missing"}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex space-x-4 mt-6">
                                <Button variant="destructive" onClick={handleReject} className="flex-1">
                                    <RefreshCw className="w-4 h-4 mr-2" /> Resume Scanning
                                </Button>
                                <Button onClick={handleConfirm} className="flex-1">
                                    Confirm & Save to Record
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
