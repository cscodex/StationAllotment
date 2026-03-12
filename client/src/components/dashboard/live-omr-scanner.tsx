import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, AlertCircle, RefreshCw, Zap, ZapOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseOMRImageData, PDF_W, PDF_H, MARKER_TL, MARKER_TR, MARKER_BL, MARKER_BR } from "@/lib/omr-utils";
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
    const [flashSupported, setFlashSupported] = useState(false);
    const [flashOn, setFlashOn] = useState(false);
    const [showCaptureFlash, setShowCaptureFlash] = useState(false);
    
    // Stability tracking (require 5 consecutive identical QR reads before capture)
    const stabilityCounter = useRef(0);
    const lastQrData = useRef("");

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

            const isMobile = window.innerWidth < 768;
            navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: "environment", 
                    width: { ideal: isMobile ? 1080 : 1920 }, 
                    height: { ideal: isMobile ? 1920 : 1080 } 
                } 
            })
                .then(s => {
                    stream = s;
                    if (videoRef.current) {
                        videoRef.current.srcObject = s;
                        videoRef.current.play();
                    }

                    // Check if device supports hardware flashlight (torch)
                    const tempTrack = s.getVideoTracks()[0];
                    if (tempTrack && tempTrack.getCapabilities) {
                        const caps = tempTrack.getCapabilities() as any;
                        if (caps.torch) {
                            setFlashSupported(true);
                        }
                    }

                    setCameraOk(true);
                    setIsScanning(true);
                    setFlashOn(false);
                    stabilityCounter.current = 0;
                    setLockedStudent(null);
                    setScanData(null);
                    setShowCaptureFlash(false);
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

    const toggleFlash = () => {
        if (!videoRef.current || !videoRef.current.srcObject) return;
        const stream = videoRef.current.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.applyConstraints === 'function') {
            track.applyConstraints({
                advanced: [{ torch: !flashOn } as any]
            })
            .then(() => setFlashOn(!flashOn))
            .catch(console.error);
        }
    };

    // Helper: draw a crosshair target on a canvas context
    const drawCrosshair = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        // Circle
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.stroke();
        // Cross
        ctx.beginPath();
        ctx.moveTo(x - size - 5, y); ctx.lineTo(x + size + 5, y);
        ctx.moveTo(x, y - size - 5); ctx.lineTo(x, y + size + 5);
        ctx.stroke();
    };

    const processFrame = useCallback(async () => {
        if (!isScanning || !videoRef.current || !hiddenCanvasRef.current || !overlayCanvasRef.current) return;

        const video = videoRef.current;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            requestAnimationFrame(processFrame);
            return;
        }

        const width = video.videoWidth;
        const height = video.videoHeight;
        
        const container = video.parentElement;
        if (!container) return;
        const cW = container.clientWidth;
        const cH = container.clientHeight;

        // Set canvases to match video resolution
        hiddenCanvasRef.current.width = width;
        hiddenCanvasRef.current.height = height;
        overlayCanvasRef.current.width = width;
        overlayCanvasRef.current.height = height;

        const ctx = hiddenCanvasRef.current.getContext('2d', { willReadFrequently: true });
        const overCtx = overlayCanvasRef.current.getContext('2d');
        if (!ctx || !overCtx) return;

        // Draw current video frame to hidden canvas
        ctx.drawImage(video, 0, 0, width, height);

        // Clear overlay
        overCtx.clearRect(0, 0, width, height);

        // Calculate visible area of the video due to 'object-cover' CSS
        const vRatio = width / height;
        const cRatio = cW / cH;
        let visibleW = width;
        let visibleH = height;

        if (vRatio > cRatio) {
            // Video is comparatively wider than container; it spans full height, cropped on left/right
            visibleH = height;
            visibleW = height * cRatio;
        } else {
            // Video is comparatively taller than container; it spans full width, cropped on top/bottom
            visibleW = width;
            visibleH = width / cRatio;
        }

        // ===== DRAW FIXED A4 GUIDE BOX WITH FIDUCIAL TARGETS =====
        // Calculate the maximum A4 box that fits within the VISIBLE area
        const A4_RATIO = PDF_H / PDF_W;
        let guideHeight = visibleH * 0.85;
        let guideWidth = guideHeight / A4_RATIO;

        // If the box is too wide for the visible screen (e.g. tablet in portrait mode), constrain by width instead
        if (guideWidth > visibleW * 0.9) {
            guideWidth = visibleW * 0.9;
            guideHeight = guideWidth * A4_RATIO;
        }

        // Center the guide box strictly in the middle of the native video resolution
        const guideX = (width - guideWidth) / 2;
        const guideY = (height - guideHeight) / 2;

        // White stencil mask outside the guide
        overCtx.fillStyle = "rgba(0, 0, 0, 0.55)";
        overCtx.beginPath();
        overCtx.rect(0, 0, width, height);
        overCtx.rect(guideX, guideY, guideWidth, guideHeight);
        overCtx.fill("evenodd");

        // Dashed border around the guide
        overCtx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        overCtx.lineWidth = 2;
        overCtx.setLineDash([12, 8]);
        overCtx.strokeRect(guideX, guideY, guideWidth, guideHeight);
        overCtx.setLineDash([]);

        // Draw 4 Fixed Fiducial Crosshair Targets at A4-proportional positions
        // These are exactly where the physical black squares are printed on the OMR form
        const targetTL = { x: guideX + (MARKER_TL.x / PDF_W) * guideWidth, y: guideY + (MARKER_TL.y / PDF_H) * guideHeight };
        const targetTR = { x: guideX + (MARKER_TR.x / PDF_W) * guideWidth, y: guideY + (MARKER_TR.y / PDF_H) * guideHeight };
        const targetBL = { x: guideX + (MARKER_BL.x / PDF_W) * guideWidth, y: guideY + (MARKER_BL.y / PDF_H) * guideHeight };
        const targetBR = { x: guideX + (MARKER_BR.x / PDF_W) * guideWidth, y: guideY + (MARKER_BR.y / PDF_H) * guideHeight };

        const targetColor = "#ff6b35"; // Vivid orange for maximum visibility
        const targetSize = Math.max(8, guideWidth * 0.02);
        drawCrosshair(overCtx, targetTL.x, targetTL.y, targetSize, targetColor);
        drawCrosshair(overCtx, targetTR.x, targetTR.y, targetSize, targetColor);
        drawCrosshair(overCtx, targetBL.x, targetBL.y, targetSize, targetColor);
        drawCrosshair(overCtx, targetBR.x, targetBR.y, targetSize, targetColor);

        // Corner bracket decorations
        overCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        overCtx.lineWidth = 4;
        const cl = 25;
        // TL
        overCtx.beginPath(); overCtx.moveTo(guideX, guideY + cl); overCtx.lineTo(guideX, guideY); overCtx.lineTo(guideX + cl, guideY); overCtx.stroke();
        // TR
        overCtx.beginPath(); overCtx.moveTo(guideX + guideWidth - cl, guideY); overCtx.lineTo(guideX + guideWidth, guideY); overCtx.lineTo(guideX + guideWidth, guideY + cl); overCtx.stroke();
        // BL
        overCtx.beginPath(); overCtx.moveTo(guideX, guideY + guideHeight - cl); overCtx.lineTo(guideX, guideY + guideHeight); overCtx.lineTo(guideX + cl, guideY + guideHeight); overCtx.stroke();
        // BR
        overCtx.beginPath(); overCtx.moveTo(guideX + guideWidth - cl, guideY + guideHeight); overCtx.lineTo(guideX + guideWidth, guideY + guideHeight); overCtx.lineTo(guideX + guideWidth, guideY + guideHeight - cl); overCtx.stroke();

        // Instructional text
        overCtx.font = `${Math.max(14, guideWidth * 0.025)}px sans-serif`;
        overCtx.fillStyle = "rgba(255, 255, 255, 0.8)";
        overCtx.textAlign = "center";
        overCtx.fillText("Align the 4 black corner squares to the orange crosshairs", width / 2, guideY - 10);

        // ===== LIGHTWEIGHT QR-ONLY DETECTION (no heavy OMR per-frame) =====
        try {
            // Only scan the guide region for QR to save CPU
            const cropImgData = ctx.getImageData(
                Math.max(0, Math.floor(guideX)),
                Math.max(0, Math.floor(guideY)),
                Math.min(Math.floor(guideWidth), width - Math.floor(guideX)),
                Math.min(Math.floor(guideHeight), height - Math.floor(guideY))
            );

            const code = jsQR(cropImgData.data, cropImgData.width, cropImgData.height, { inversionAttempts: "attemptBoth" });
            if (!code) {
                stabilityCounter.current = 0;
                lastQrData.current = "";
                requestAnimationFrame(processFrame);
                return;
            }

            // Draw green box around detected QR (offset back to full-frame coordinates)
            const ox = Math.floor(guideX);
            const oy = Math.floor(guideY);
            overCtx.strokeStyle = "#22c55e";
            overCtx.lineWidth = 4;
            overCtx.beginPath();
            overCtx.moveTo(ox + code.location.topLeftCorner.x, oy + code.location.topLeftCorner.y);
            overCtx.lineTo(ox + code.location.topRightCorner.x, oy + code.location.topRightCorner.y);
            overCtx.lineTo(ox + code.location.bottomRightCorner.x, oy + code.location.bottomRightCorner.y);
            overCtx.lineTo(ox + code.location.bottomLeftCorner.x, oy + code.location.bottomLeftCorner.y);
            overCtx.closePath();
            overCtx.stroke();

            // Stability check: same QR data for 5 consecutive frames
            if (code.data === lastQrData.current) {
                stabilityCounter.current++;
            } else {
                lastQrData.current = code.data;
                stabilityCounter.current = 1;
            }

            // Show stability progress
            overCtx.fillStyle = "rgba(34, 197, 94, 0.9)";
            overCtx.font = `bold ${Math.max(16, guideWidth * 0.03)}px sans-serif`;
            overCtx.textAlign = "center";
            overCtx.fillText(
                stabilityCounter.current >= 5 ? "✓ Capturing..." : `Stabilizing... ${stabilityCounter.current}/5`,
                width / 2,
                guideY + guideHeight + Math.max(20, guideHeight * 0.04)
            );

            // Once stable, CAPTURE and PROCESS the frame
            if (stabilityCounter.current >= 5) {
                // ===== CAPTURE: Crop guide region and scale to PDF dimensions =====
                const RENDER_SCALE = 2.0; // Same scale used by bulk scanner
                const targetW = Math.floor(PDF_W * RENDER_SCALE);
                const targetH = Math.floor(PDF_H * RENDER_SCALE);

                const captureCanvas = document.createElement("canvas");
                captureCanvas.width = targetW;
                captureCanvas.height = targetH;
                const captureCtx = captureCanvas.getContext("2d");
                if (!captureCtx) { requestAnimationFrame(processFrame); return; }

                // Draw the guide region scaled to exact PDF dimensions
                captureCtx.drawImage(
                    hiddenCanvasRef.current!,
                    Math.floor(guideX), Math.floor(guideY), Math.floor(guideWidth), Math.floor(guideHeight),
                    0, 0, targetW, targetH
                );

                const capturedImgData = captureCtx.getImageData(0, 0, targetW, targetH);

                // Trigger visual flash
                setShowCaptureFlash(true);
                setTimeout(() => setShowCaptureFlash(false), 300);

                // ===== PROCESS: Use the exact same pipeline as bulk scanner =====
                // 1. Find student from QR
                let detectedStudent: Student | null = null;
                try {
                    const qrPayload = JSON.parse(code.data);
                    if (qrPayload.id) {
                        detectedStudent = students.find(s => s.id === qrPayload.id) || null;
                    }
                } catch (e) {
                    // Invalid QR payload
                }

                if (!detectedStudent) {
                    stabilityCounter.current = 0;
                    requestAnimationFrame(processFrame);
                    return;
                }

                // 2. Run OMR extraction on the cropped+scaled image (identical to bulk scanner)
                try {
                    const parsedOMR = await parseOMRImageData(capturedImgData, 0, 0, false);
                    const { selectedStream, choices } = parsedOMR;

                    if (selectedStream && choices.filter(c => c && c.trim() !== "").length > 0) {
                        setLockedStudent(detectedStudent);
                        setScanData({ stream: selectedStream, choices });
                        setIsScanning(false);
                        return; // EXIT LOOP - show result
                    }
                } catch (err) {
                    console.error("OMR extraction error:", err);
                }

                // If extraction failed, reset and keep trying
                stabilityCounter.current = 0;
                requestAnimationFrame(processFrame);
                return;
            }
        } catch (err) {
            // Ignore frame errors and continue
        }

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
            
            // Resume scanning for next paper
            setLockedStudent(null);
            setScanData(null);
            lastQrData.current = "";
            stabilityCounter.current = 0;
            setIsScanning(true);
        }
    };

    const handleReject = () => {
        setLockedStudent(null);
        setScanData(null);
        lastQrData.current = "";
        stabilityCounter.current = 0;
        setShowCaptureFlash(false);
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
                        Align the 4 black corner squares on the OMR sheet to the orange crosshair targets. Hold steady until captured.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative w-full h-[65vh] sm:h-[70vh] md:h-auto md:aspect-video bg-black rounded-lg overflow-hidden border">
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
                        className={`w-full h-full object-cover ${!isScanning && lockedStudent ? 'filter blur-sm opacity-50' : ''}`}
                    />
                    
                    {/* Hidden canvas for data extraction */}
                    <canvas ref={hiddenCanvasRef} className="hidden" />
                    
                    {/* Overlay canvas for guide UI and feedback */}
                    <canvas 
                        ref={overlayCanvasRef} 
                        className={`absolute top-0 left-0 w-full h-full object-cover pointer-events-none transition-opacity duration-200 ${!isScanning && lockedStudent ? 'opacity-0' : 'opacity-100'}`}
                    />

                    {/* Visible Camera Feedback Flash */}
                    {showCaptureFlash && (
                        <div className="absolute inset-0 bg-white z-40 transition-opacity duration-300 pointer-events-none" />
                    )}

                    {/* HUD: Scanning Indicator and Flashlight */}
                    {isScanning && cameraOk && (
                        <div className="absolute top-4 right-4 flex items-center space-x-2">
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={toggleFlash}
                                disabled={!flashSupported}
                                className={`bg-black/60 border border-white/20 text-white rounded-full p-2 h-auto transition-opacity ${flashSupported ? 'hover:bg-black/80' : 'opacity-50 cursor-not-allowed'}`}
                                title={flashSupported ? (flashOn ? "Turn off flash" : "Turn on flash") : "Flash not supported"}
                            >
                                {flashOn ? <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : <ZapOff className="w-4 h-4" />}
                            </Button>
                            <div className="bg-black/60 px-3 py-1.5 rounded-full flex items-center space-x-2 border border-white/20">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-xs font-semibold text-white tracking-widest uppercase">Scanning</span>
                            </div>
                        </div>
                    )}

                    {/* Final Result Modal Overlay */}
                    {!isScanning && lockedStudent && scanData && (
                        <div className="absolute inset-x-4 inset-y-4 sm:inset-x-8 sm:inset-y-8 bg-white/95 text-black rounded-xl shadow-2xl p-4 sm:p-6 flex flex-col justify-center border-2 border-primary/20 backdrop-blur-md animate-in zoom-in-95 duration-200 overflow-auto">
                            <div className="flex items-center space-x-3 mb-4 sm:mb-6">
                                <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-green-500 flex-shrink-0" />
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold">Scan Complete</h3>
                                    <p className="text-xs sm:text-sm text-zinc-600">Student: <strong>{lockedStudent.name}</strong> (Merit #: {lockedStudent.meritNumber})</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 flex-1 overflow-auto bg-slate-50 p-3 sm:p-4 border rounded-lg">
                                <div>
                                    <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-2">Detected Stream</h4>
                                    <p className="text-base sm:text-lg font-bold text-primary">{scanData.stream}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-2">Detected Choices</h4>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs sm:text-sm">
                                        {scanData.choices.map((c, i) => (
                                            <div key={i} className="flex">
                                                <span className="w-6 text-zinc-400 font-mono">{i + 1}.</span>
                                                <span className={c ? 'font-medium' : 'text-rose-500 italic text-xs'}>{c || "Missing"}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex space-x-4 mt-4 sm:mt-6">
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
