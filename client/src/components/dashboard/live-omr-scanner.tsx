import React, { useState, useEffect, useRef, useCallback } from "react";
import { resizeCanvasToA4 } from "@/lib/image-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, AlertCircle, RefreshCw, Zap, ZapOff, Crosshair } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseOMRImageData, PDF_W, PDF_H, MARKER_TL, MARKER_TR, MARKER_BL, MARKER_BR, sampleIntensity, decodeQRHybrid, STREAM_POS, GRID_ORIGIN, COL_STEP, ROW_STEP, STREAMS, DISTRICTS } from "@/lib/omr-utils";
import type { Student } from "@shared/schema";

interface LiveOMRScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    students: Student[];
    onSaveData: (studentId: string, stream: string, choices: string[], imageUrl?: string) => void;
    /** If provided, skip QR detection and use this student directly */
    prelockedStudent?: Student;
}

export function LiveOMRScannerModal({ isOpen, onClose, students, onSaveData, prelockedStudent }: LiveOMRScannerModalProps) {
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

    const [isScanning, setIsScanning] = useState(false);
    const [cameraOk, setCameraOk] = useState<boolean | null>(null);
    const [lockedStudent, setLockedStudent] = useState<Student | null>(null);
    const [scanData, setScanData] = useState<{ stream: string | null, choices: string[], imageUrl?: string } | null>(null);
    const [flashSupported, setFlashSupported] = useState(false);
    const [flashOn, setFlashOn] = useState(false);
    const [showCaptureFlash, setShowCaptureFlash] = useState(false);
    
    // Gyroscope state
    const [tiltBeta, setTiltBeta] = useState<number | null>(null); // front-back
    const [tiltGamma, setTiltGamma] = useState<number | null>(null); // left-right
    const [gyroAvailable, setGyroAvailable] = useState(false);
    
    // Stability tracking
    const stabilityCounter = useRef(0);
    const lastQrData = useRef("");
    const markerStabilityCounter = useRef(0);
    
    // Continuous Background Barcode tracking
    const isScanningBarcodeRef = useRef(false);
    const scannedBarcodeBoxRef = useRef<{ topLeftCorner: { x: number, y: number }, topRightCorner: { x: number, y: number }, bottomRightCorner: { x: number, y: number }, bottomLeftCorner: { x: number, y: number }, time: number, format?: string, data?: string } | null>(null);

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

    // Gyroscope / Accelerometer
    useEffect(() => {
        if (!isOpen) return;

        const handleOrientation = (e: DeviceOrientationEvent) => {
            if (e.beta !== null && e.gamma !== null) {
                setGyroAvailable(true);
                setTiltBeta(e.beta);
                setTiltGamma(e.gamma);
            }
        };

        // iOS 13+ requires explicit permission
        const startGyro = async () => {
            try {
                const DOE = DeviceOrientationEvent as any;
                if (typeof DOE.requestPermission === "function") {
                    const perm = await DOE.requestPermission();
                    if (perm === "granted") {
                        window.addEventListener("deviceorientation", handleOrientation);
                    }
                } else {
                    window.addEventListener("deviceorientation", handleOrientation);
                }
            } catch (e) {
                console.warn("Gyroscope not available:", e);
            }
        };

        startGyro();
        return () => {
            window.removeEventListener("deviceorientation", handleOrientation);
        };
    }, [isOpen]);

    const toggleFlash = () => {
        if (!videoRef.current || !videoRef.current.srcObject) return;
        const stream = videoRef.current.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.applyConstraints === 'function') {
            const newFlash = !flashOn;
            track.applyConstraints({ advanced: [{ torch: newFlash } as any] })
                .then(() => setFlashOn(newFlash))
                .catch((e: any) => console.warn("Flash toggle failed:", e));
        }
    };

    // Helper to draw crosshairs
    const drawCrosshair = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - size - 5, y); ctx.lineTo(x + size + 5, y);
        ctx.moveTo(x, y - size - 5); ctx.lineTo(x, y + size + 5);
        ctx.stroke();
    };

    // Helper: capture the current frame, run OMR extraction, and display result
    const captureAndProcess = useCallback(async (detectedStudent: Student) => {
        if (!videoRef.current || !hiddenCanvasRef.current || !overlayCanvasRef.current) return false;

        const video = videoRef.current;
        const width = video.videoWidth;
        const height = video.videoHeight;

        const container = video.parentElement;
        if (!container) return false;
        const cW = container.clientWidth;
        const cH = container.clientHeight;

        // Recalculate visible area
        const vRatio = width / height;
        const cRatio = cW / cH;
        let visibleW = width, visibleH = height;
        if (vRatio > cRatio) { visibleH = height; visibleW = height * cRatio; }
        else { visibleW = width; visibleH = width / cRatio; }

        const A4_RATIO = PDF_H / PDF_W;
        let guideHeight = visibleH * 0.95;
        let guideWidth = guideHeight / A4_RATIO;
        if (guideWidth > visibleW * 0.95) {
            guideWidth = visibleW * 0.95;
            guideHeight = guideWidth * A4_RATIO;
        }
        const guideX = (width - guideWidth) / 2;
        const guideY = (height - guideHeight) / 2;

        // Crop guide region and scale to PDF dimensions
        const RENDER_SCALE = 2.0;
        const targetW = Math.floor(PDF_W * RENDER_SCALE);
        const targetH = Math.floor(PDF_H * RENDER_SCALE);

        const captureCanvas = document.createElement("canvas");
        captureCanvas.width = targetW;
        captureCanvas.height = targetH;
        const captureCtx = captureCanvas.getContext("2d");
        if (!captureCtx) return false;

        // Ensure hidden canvas has the latest frame
        const hCtx = hiddenCanvasRef.current.getContext("2d");
        if (!hCtx) return false;
        hiddenCanvasRef.current.width = width;
        hiddenCanvasRef.current.height = height;
        hCtx.drawImage(video, 0, 0, width, height);

        captureCtx.drawImage(
            hiddenCanvasRef.current,
            Math.floor(guideX), Math.floor(guideY), Math.floor(guideWidth), Math.floor(guideHeight),
            0, 0, targetW, targetH
        );

        const capturedImgData = captureCtx.getImageData(0, 0, targetW, targetH);

        // Visual flash
        setShowCaptureFlash(true);
        setTimeout(() => setShowCaptureFlash(false), 300);

        // Run OMR extraction
        try {
            const parsedOMR = await parseOMRImageData(capturedImgData, 0, 0, false);
            const { selectedStream, choices, toPixel, markerTL, markerTR, markerBL, markerBR } = parsedOMR;

            // Derive sampleR for overlay drawing
            const pxDist = Math.hypot(
                (markerTR?.x || 0) - (markerTL?.x || 0),
                (markerTR?.y || 0) - (markerTL?.y || 0)
            );
            const overlayScale = pxDist / 510.28 || (targetW / 595.28);
            const overlaySampleR = 8 * overlayScale * 0.70;

            // Draw highlighted overlays on the captured image
            if (toPixel) {
                // Draw green filled circles on detected stream bubble
                const streamIdx = selectedStream ? STREAMS.indexOf(selectedStream) : -1;
                for (let si = 0; si < STREAM_POS.length; si++) {
                    const p = toPixel(STREAM_POS[si].x, STREAM_POS[si].y);
                    captureCtx.beginPath();
                    captureCtx.arc(p.x, p.y, overlaySampleR + 2, 0, 2 * Math.PI);
                    if (si === streamIdx) {
                        captureCtx.fillStyle = "rgba(34, 197, 94, 0.4)";
                        captureCtx.fill();
                        captureCtx.strokeStyle = "#22c55e";
                        captureCtx.lineWidth = 3;
                    } else {
                        captureCtx.strokeStyle = "rgba(0, 200, 200, 0.5)";
                        captureCtx.lineWidth = 1.5;
                    }
                    captureCtx.stroke();
                }

                // Draw highlighted circles on all grid bubbles, green for detected ones
                for (let r = 0; r < 10; r++) {
                    for (let c = 0; c < 10; c++) {
                        const p = toPixel(GRID_ORIGIN.x + c * COL_STEP, GRID_ORIGIN.y + r * ROW_STEP);
                        const isDetected = choices[c] === DISTRICTS[r] && choices[c] !== "";
                        captureCtx.beginPath();
                        captureCtx.arc(p.x, p.y, overlaySampleR + 1, 0, 2 * Math.PI);
                        if (isDetected) {
                            captureCtx.fillStyle = "rgba(34, 197, 94, 0.4)";
                            captureCtx.fill();
                            captureCtx.strokeStyle = "#22c55e";
                            captureCtx.lineWidth = 3;
                        } else {
                            captureCtx.strokeStyle = "rgba(255, 100, 100, 0.3)";
                            captureCtx.lineWidth = 1;
                        }
                        captureCtx.stroke();
                    }
                }

                // Draw fiducial marker indicators
                const markers = [markerTL, markerTR, markerBL, markerBR];
                for (const mk of markers) {
                    if (!mk) continue;
                    captureCtx.strokeStyle = "#ff6b35";
                    captureCtx.lineWidth = 2;
                    captureCtx.beginPath();
                    captureCtx.moveTo(mk.x - 10, mk.y); captureCtx.lineTo(mk.x + 10, mk.y);
                    captureCtx.moveTo(mk.x, mk.y - 10); captureCtx.lineTo(mk.x, mk.y + 10);
                    captureCtx.stroke();
                }
            }

            if (selectedStream && choices.filter(c => c && c.trim() !== "").length > 0) {
                setLockedStudent(detectedStudent);
                // Pre-compress the capture canvas to A4 proportions before generating dataURL
                const resizedCapture = resizeCanvasToA4(captureCanvas);
                setScanData({ 
                    stream: selectedStream, 
                    choices,
                    imageUrl: resizedCapture.toDataURL("image/jpeg", 0.75)
                });
                setIsScanning(false);
                return true;
            } else {
                toast({
                    title: "Extraction Incomplete",
                    description: `Stream: ${selectedStream || "Not detected"}, Choices found: ${choices.filter(c => c).length}/10. Try adjusting position.`,
                    variant: "destructive",
                });
                return false;
            }
        } catch (err) {
            console.error("OMR extraction error:", err);
            toast({
                title: "Extraction Failed",
                description: "Could not read OMR data from frame. Try adjusting position and lighting.",
                variant: "destructive",
            });
            return false;
        }
    }, [toast]);

    // Manual capture handler
    const handleManualCapture = useCallback(async () => {
        if (!videoRef.current || !hiddenCanvasRef.current) return;

        const video = videoRef.current;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

        const width = video.videoWidth;
        const height = video.videoHeight;

        // If we have a prelocked student, use them directly (no QR needed)
        if (prelockedStudent) {
            await captureAndProcess(prelockedStudent);
            return;
        }

        // Otherwise, try QR detection on the current frame
        const container = video.parentElement;
        if (!container) return;
        const cW = container.clientWidth;
        const cH = container.clientHeight;

        // Recalculate guide box
        const vRatio = width / height;
        const cRatio = cW / cH;
        let visibleW = width, visibleH = height;
        if (vRatio > cRatio) { visibleH = height; visibleW = height * cRatio; }
        else { visibleW = width; visibleH = width / cRatio; }

        const A4_RATIO = PDF_H / PDF_W;
        let guideHeight = visibleH * 0.95;
        let guideWidth = guideHeight / A4_RATIO;
        if (guideWidth > visibleW * 0.95) {
            guideWidth = visibleW * 0.95;
            guideHeight = guideWidth * A4_RATIO;
        }
        const guideX = (width - guideWidth) / 2;
        const guideY = (height - guideHeight) / 2;

        // Get current frame
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tCtx = tempCanvas.getContext("2d");
        if (!tCtx) return;
        tCtx.drawImage(video, 0, 0, width, height);

        // Try QR from guide region
        const cropImgData = tCtx.getImageData(
            Math.max(0, Math.floor(guideX)),
            Math.max(0, Math.floor(guideY)),
            Math.min(Math.floor(guideWidth), width - Math.floor(guideX)),
            Math.min(Math.floor(guideHeight), height - Math.floor(guideY))
        );

        // Optimistic check: if the loop already found a stable barcode in the last 1s, use it!
        const lastBox = scannedBarcodeBoxRef.current;
        let code: any = null;
        if (lastBox && Date.now() - lastBox.time < 1000 && lastBox.data) {
            console.log("Using cached barcode from tracker:", lastBox.format);
            code = { data: lastBox.data, location: lastBox, format: lastBox.format };
        } else {
            // Try QR from guide region
            const cropImgData = tCtx.getImageData(
                Math.max(0, Math.floor(guideX - 20)), // 20px padding
                Math.max(0, Math.floor(guideY - 20)),
                Math.min(Math.floor(guideWidth + 40), width - Math.floor(guideX)),
                Math.min(Math.floor(guideHeight + 40), height - Math.floor(guideY))
            );
            
            code = await decodeQRHybrid(cropImgData);
            
            // If guide region failed, try the full frame
            if (!code) {
                const fullImgData = tCtx.getImageData(0, 0, width, height);
                code = await decodeQRHybrid(fullImgData);
            }
        }

        if (!code) {
            toast({
                title: "QR Code Not Found",
                description: "Could not detect a QR code. Ensure the OMR form is visible and well-lit.",
                variant: "destructive",
            });
            return;
        }

        let detectedStudent: Student | null = null;
        try {
            let studentId: string | null = null;
            let studentName: string | null = null;

            // First try to parse as JSON (QR Code Format)
            if (code.data.startsWith('{')) {
                const payload = JSON.parse(code.data);
                studentId = payload.id;
                studentName = payload.appNo;
            } else if (code.data.includes('-') && code.data.length >= 36) {
                // Postgres UUIDs are 36 chars long. The barcode contains `${student.id}-${student.appNo}`
                studentId = code.data.substring(0, 36);
                studentName = code.data.substring(37) || code.data;
            } else {
                studentId = code.data;
            }

            if (studentId) {
                detectedStudent = students.find(s => s.id.toString() === studentId.toString()) || null;
            }
        } catch (e) {
            console.warn("Failed to parse barcode data:", code.data);
        }

        if (!detectedStudent) {
            toast({
                title: "Student Not Found",
                description: "QR detected but student not matched in system.",
                variant: "destructive",
            });
            return;
        }

        await captureAndProcess(detectedStudent);
    }, [prelockedStudent, students, captureAndProcess, toast]);

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

        hiddenCanvasRef.current.width = width;
        hiddenCanvasRef.current.height = height;
        overlayCanvasRef.current.width = width;
        overlayCanvasRef.current.height = height;

        const ctx = hiddenCanvasRef.current.getContext('2d', { willReadFrequently: true });
        const overCtx = overlayCanvasRef.current.getContext('2d');
        if (!ctx || !overCtx) return;

        ctx.drawImage(video, 0, 0, width, height);
        overCtx.clearRect(0, 0, width, height);

        // Calculate visible area of the video due to 'object-cover' CSS
        const vRatio = width / height;
        const cRatio = cW / cH;
        let visibleW = width, visibleH = height;
        if (vRatio > cRatio) { visibleH = height; visibleW = height * cRatio; }
        else { visibleW = width; visibleH = width / cRatio; }

        // A4 Guide Box
        const A4_RATIO = PDF_H / PDF_W;
        let guideHeight = visibleH * 0.95;
        let guideWidth = guideHeight / A4_RATIO;
        if (guideWidth > visibleW * 0.95) {
            guideWidth = visibleW * 0.95;
            guideHeight = guideWidth * A4_RATIO;
        }
        const guideX = (width - guideWidth) / 2;
        const guideY = (height - guideHeight) / 2;

        // Semi-transparent mask
        overCtx.fillStyle = "rgba(0, 0, 0, 0.55)";
        overCtx.beginPath();
        overCtx.rect(0, 0, width, height);
        overCtx.rect(guideX, guideY, guideWidth, guideHeight);
        overCtx.fill("evenodd");

        // Dashed border
        overCtx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        overCtx.lineWidth = 2;
        overCtx.setLineDash([12, 8]);
        overCtx.strokeRect(guideX, guideY, guideWidth, guideHeight);
        overCtx.setLineDash([]);

        // Fiducial Crosshairs
        const targetTL = { x: guideX + (MARKER_TL.x / PDF_W) * guideWidth, y: guideY + (MARKER_TL.y / PDF_H) * guideHeight };
        const targetTR = { x: guideX + (MARKER_TR.x / PDF_W) * guideWidth, y: guideY + (MARKER_TR.y / PDF_H) * guideHeight };
        const targetBL = { x: guideX + (MARKER_BL.x / PDF_W) * guideWidth, y: guideY + (MARKER_BL.y / PDF_H) * guideHeight };
        const targetBR = { x: guideX + (MARKER_BR.x / PDF_W) * guideWidth, y: guideY + (MARKER_BR.y / PDF_H) * guideHeight };

        const targetColor = "#ff6b35";
        const targetSize = Math.max(8, guideWidth * 0.02);
        drawCrosshair(overCtx, targetTL.x, targetTL.y, targetSize, targetColor);
        drawCrosshair(overCtx, targetTR.x, targetTR.y, targetSize, targetColor);
        drawCrosshair(overCtx, targetBL.x, targetBL.y, targetSize, targetColor);
        drawCrosshair(overCtx, targetBR.x, targetBR.y, targetSize, targetColor);

        // Connect crosshairs with lines to form a visible quadrilateral
        overCtx.strokeStyle = "rgba(255, 107, 53, 0.7)";
        overCtx.lineWidth = 2;
        overCtx.setLineDash([6, 4]);
        overCtx.beginPath();
        overCtx.moveTo(targetTL.x, targetTL.y);
        overCtx.lineTo(targetTR.x, targetTR.y);
        overCtx.lineTo(targetBR.x, targetBR.y);
        overCtx.lineTo(targetBL.x, targetBL.y);
        overCtx.closePath();
        overCtx.stroke();
        overCtx.setLineDash([]);

        // Corner brackets
        overCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        overCtx.lineWidth = 4;
        const cl = 25;
        overCtx.beginPath(); overCtx.moveTo(guideX, guideY + cl); overCtx.lineTo(guideX, guideY); overCtx.lineTo(guideX + cl, guideY); overCtx.stroke();
        overCtx.beginPath(); overCtx.moveTo(guideX + guideWidth - cl, guideY); overCtx.lineTo(guideX + guideWidth, guideY); overCtx.lineTo(guideX + guideWidth, guideY + cl); overCtx.stroke();
        overCtx.beginPath(); overCtx.moveTo(guideX, guideY + guideHeight - cl); overCtx.lineTo(guideX, guideY + guideHeight); overCtx.lineTo(guideX + cl, guideY + guideHeight); overCtx.stroke();
        overCtx.beginPath(); overCtx.moveTo(guideX + guideWidth - cl, guideY + guideHeight); overCtx.lineTo(guideX + guideWidth, guideY + guideHeight); overCtx.lineTo(guideX + guideWidth, guideY + guideHeight - cl); overCtx.stroke();

        // Instruction text
        overCtx.font = `${Math.max(14, guideWidth * 0.025)}px sans-serif`;
        overCtx.fillStyle = "rgba(255, 255, 255, 0.8)";
        overCtx.textAlign = "center";
        const instructionText = prelockedStudent 
            ? `Scanning for: ${prelockedStudent.name} — Align page or tap Capture`
            : "Align OMR page or tap Capture button below";
        overCtx.fillText(instructionText, width / 2, guideY - 10);

        // Draw Expected QR Zone indicator (only in global mode where QR matters)
        if (!prelockedStudent) {
            const qrPdfX = 440;
            const qrPdfY = 50;  // PDF drawImage(y=170) is from bottom. Top = 841-170-90 = 80. Add padding.
            const qrPdfW = 160;
            const qrPdfH = 160;
            const qrPixelX = guideX + (qrPdfX / PDF_W) * guideWidth;
            const qrPixelY = guideY + (qrPdfY / PDF_H) * guideHeight;
            const qrPixelW = (qrPdfW / PDF_W) * guideWidth;
            const qrPixelH = (qrPdfH / PDF_H) * guideHeight;

            overCtx.strokeStyle = "rgba(59, 130, 246, 0.6)"; // Blue dashed box
            overCtx.lineWidth = 2;
            overCtx.setLineDash([6, 4]);
            overCtx.strokeRect(qrPixelX, qrPixelY, qrPixelW, qrPixelH);
            
            overCtx.fillStyle = "rgba(59, 130, 246, 0.8)";
            overCtx.font = `bold ${Math.max(12, guideWidth * 0.02)}px sans-serif`;
            overCtx.fillText("QR Zone", qrPixelX + qrPixelW / 2, qrPixelY - 8);
            overCtx.setLineDash([]);
        }

        // ===== FIDUCIAL MARKER DETECTION (Relative Darkness) =====
        // Instead of absolute thresholds, compare each marker position to its surroundings.
        // A fiducial marker is detected when the spot is significantly DARKER than nearby paper.
        const imgData = ctx.getImageData(0, 0, width, height);
        const markerCheckR = Math.max(4, Math.floor(targetSize * 0.5));
        const surroundR = Math.max(markerCheckR * 3, 20); // sample surrounding paper further out
        const RELATIVE_GAP = 40; // marker must be this much darker than surrounding paper

        const markerPositions = [targetTL, targetTR, targetBL, targetBR];
        let alignedCount = 0;

        for (let m = 0; m < markerPositions.length; m++) {
            const mp = markerPositions[m];
            const mx = Math.floor(mp.x);
            const my = Math.floor(mp.y);

            // Sample the crosshair spot (should be dark if marker is underneath)
            const spotIntensity = sampleIntensity(imgData.data, width, height, mx, my, markerCheckR);

            // Sample surrounding paper area (average of 4 points offset from center)
            const offsets = [
                { x: mx - surroundR, y: my },
                { x: mx + surroundR, y: my },
                { x: mx, y: my - surroundR },
                { x: mx, y: my + surroundR },
            ];
            let surroundSum = 0;
            let surroundN = 0;
            for (const off of offsets) {
                if (off.x >= 0 && off.x < width && off.y >= 0 && off.y < height) {
                    surroundSum += sampleIntensity(imgData.data, width, height, off.x, off.y, markerCheckR);
                    surroundN++;
                }
            }
            const surroundAvg = surroundN > 0 ? surroundSum / surroundN : 255;

            // Marker is "aligned" if spot is significantly darker than surroundings
            const isAligned = (surroundAvg - spotIntensity) > RELATIVE_GAP;
            if (isAligned) alignedCount++;

            // Draw feedback: green if aligned, keep orange if not
            if (isAligned) {
                drawCrosshair(overCtx, mp.x, mp.y, targetSize, "#22c55e");
            }
        }

        // Show alignment status
        const alignText = alignedCount >= 4 ? "✓ All 4 markers aligned!"
            : alignedCount >= 2 ? `${alignedCount}/4 markers aligned`
            : "Align OMR page to crosshairs";
        overCtx.fillStyle = alignedCount >= 2 ? "rgba(34, 197, 94, 0.9)" : "rgba(255, 200, 50, 0.9)";
        overCtx.font = `bold ${Math.max(14, guideWidth * 0.025)}px sans-serif`;
        overCtx.textAlign = "center";
        overCtx.fillText(alignText, width / 2, guideY + guideHeight + Math.max(20, guideHeight * 0.04));

        // --- DEBUG OVERLAY: Constantly project the OMR Grid onto the screen based on raw fiducial anchors ---
        const pdfW = 510.28; // 552.78 - 42.5
        const pdfH = 756.89; // 799.39 - 42.5
        const toPixel = (pdfX: number, pdfY: number) => {
            const tx = (pdfX - MARKER_TL.x) / pdfW;
            const ty = (pdfY - MARKER_TL.y) / pdfH;
            const px = (1 - tx) * (1 - ty) * targetTL.x + tx * (1 - ty) * targetTR.x + (1 - tx) * ty * targetBL.x + tx * ty * targetBR.x;
            const py = (1 - tx) * (1 - ty) * targetTL.y + tx * (1 - ty) * targetTR.y + (1 - tx) * ty * targetBL.y + tx * ty * targetBR.y;
            return { x: px, y: py };
        };

        // Draw Stream Dots (Cyan)
        overCtx.fillStyle = "rgba(0, 255, 255, 0.8)";
        STREAM_POS.forEach(pos => {
            const p = toPixel(pos.x, pos.y);
            overCtx.beginPath();
            overCtx.arc(p.x, p.y, Math.max(3, guideWidth * 0.005), 0, Math.PI * 2);
            overCtx.fill();
        });

        // Draw Choice Grid Dots (Pink)
        overCtx.fillStyle = "rgba(255, 0, 255, 0.7)";
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 10; c++) {
                const p = toPixel(GRID_ORIGIN.x + c * COL_STEP, GRID_ORIGIN.y + r * ROW_STEP);
                overCtx.beginPath();
                overCtx.arc(p.x, p.y, Math.max(2, guideWidth * 0.004), 0, Math.PI * 2);
                overCtx.fill();
            }
        }

        // ====================================================
        // Continuous Background Barcode/QR Tracker (Visual Feedback)
        // ====================================================
        if (!isScanningBarcodeRef.current && !prelockedStudent) {
            const now = Date.now();
            const lastScanTime = scannedBarcodeBoxRef.current?.time || 0;
            if (now - lastScanTime > 300) { // Throttle ~3 FPS
                isScanningBarcodeRef.current = true;
                const cropImgData = ctx.getImageData(
                    Math.max(0, Math.floor(guideX)),
                    Math.max(0, Math.floor(guideY)),
                    Math.min(Math.floor(guideWidth), width - Math.floor(guideX)),
                    Math.min(Math.floor(guideHeight), height - Math.floor(guideY))
                );

                decodeQRHybrid(cropImgData, true).then(code => {
                    if (code && code.location) {
                        console.log("Barcode format tracked:", code.format);
                        scannedBarcodeBoxRef.current = {
                            ...code.location,
                            time: Date.now(),
                            format: String(code.format), // ensure it's a string
                            data: code.data // Store the raw data so capture can use it
                        };
                    }
                    isScanningBarcodeRef.current = false;
                }).catch(() => {
                    isScanningBarcodeRef.current = false;
                });
            }
        }

        // Draw the barcode bounding box if detected recently (within last 1s)
        const box = scannedBarcodeBoxRef.current;
        if (box && box.format && Date.now() - box.time < 1000) {
            // Check for normalized format strings (qrcode, 4, etc)
            const isQR = box.format.toLowerCase().includes('qr') || box.format === '4';
            
            if (isQR) {
                // Standard Green Bounding Box for QR Codes
                overCtx.strokeStyle = "#22c55e"; // bright green
                overCtx.lineWidth = 4;
                overCtx.beginPath();
                overCtx.moveTo(guideX + box.topLeftCorner.x, guideY + box.topLeftCorner.y);
                overCtx.lineTo(guideX + box.topRightCorner.x, guideY + box.topRightCorner.y);
                overCtx.lineTo(guideX + box.bottomRightCorner.x, guideY + box.bottomRightCorner.y);
                overCtx.lineTo(guideX + box.bottomLeftCorner.x, guideY + box.bottomLeftCorner.y);
                overCtx.closePath();
                overCtx.stroke();
                
                // Draw a label
                overCtx.fillStyle = "rgba(34, 197, 94, 0.9)";
                overCtx.fillRect(guideX + box.topLeftCorner.x, guideY + box.topLeftCorner.y - 24, 70, 24);
                overCtx.fillStyle = "white";
                overCtx.font = "bold 12px sans-serif";
                overCtx.fillText("QR Code", guideX + box.topLeftCorner.x + 10, guideY + box.topLeftCorner.y - 8);
            } else {
                // Vertical Red Laser Indicator for 1D Barcodes
                const midTopX = guideX + (box.topLeftCorner.x + box.topRightCorner.x) / 2;
                const midTopY = guideY + (box.topLeftCorner.y + box.topRightCorner.y) / 2;
                const midBotX = guideX + (box.bottomLeftCorner.x + box.bottomRightCorner.x) / 2;
                const midBotY = guideY + (box.bottomLeftCorner.y + box.bottomRightCorner.y) / 2;
                
                // Draw the laser line
                overCtx.strokeStyle = "rgba(239, 68, 68, 0.9)"; // bright red
                overCtx.lineWidth = 3;
                
                // Add a glow
                overCtx.shadowColor = "rgba(239, 68, 68, 0.8)";
                overCtx.shadowBlur = 10;
                
                overCtx.beginPath();
                overCtx.moveTo(midTopX, midTopY - 20); // extend laser slightly above and below
                overCtx.lineTo(midBotX, midBotY + 20);
                overCtx.stroke();
                
                // Reset shadow
                overCtx.shadowBlur = 0;
                
                // Draw label
                overCtx.fillStyle = "rgba(239, 68, 68, 0.9)";
                overCtx.fillRect(midTopX - 35, midTopY - 30, 70, 24);
                overCtx.fillStyle = "white";
                overCtx.font = "bold 12px sans-serif";
                overCtx.fillText("Barcode", midTopX - 25, midTopY - 14);
            }
        }

        requestAnimationFrame(processFrame);
    }, [isScanning, students, prelockedStudent, captureAndProcess]);

    // Trigger loop
    useEffect(() => {
        if (isScanning && cameraOk) {
            requestAnimationFrame(processFrame);
        }
    }, [isScanning, cameraOk, processFrame]);

    const handleConfirm = () => {
        if (lockedStudent && scanData && scanData.stream) {
            onSaveData(lockedStudent.id.toString(), scanData.stream, scanData.choices, scanData.imageUrl);
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

    // Gyroscope level indicator helper
    const getLevelInfo = () => {
        if (tiltBeta === null || tiltGamma === null) return null;
        // When the phone is held FLAT (horizontal, face-up), beta ≈ 0, gamma ≈ 0
        // This is the ideal scanning position — phone parallel to the paper on the table.
        const absGamma = Math.abs(tiltGamma);
        const absBeta = Math.abs(tiltBeta); // deviation from flat (0°)
        const totalTilt = absGamma + absBeta;
        
        if (totalTilt < 10) return { color: "#22c55e", label: "Level ✓", status: "good" };
        if (totalTilt < 25) return { color: "#eab308", label: "Almost level", status: "ok" };
        return { color: "#ef4444", label: "Tilt detected", status: "bad" };
    };

    const dialogTitle = prelockedStudent 
        ? `Live Scan — ${prelockedStudent.name}`
        : "Live Real-Time OMR Scanner";

    const dialogDesc = prelockedStudent
        ? `Scanning OMR form for ${prelockedStudent.name} (${prelockedStudent.appNo}). Align the page and tap Capture.`
        : "Align the OMR page within the guide or tap the Capture button. Hold steady for auto-detection.";

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) onClose();
        }}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDesc}</DialogDescription>
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
                    
                    <canvas ref={hiddenCanvasRef} className="hidden" />
                    
                    <canvas 
                        ref={overlayCanvasRef} 
                        className={`absolute top-0 left-0 w-full h-full object-cover pointer-events-none transition-opacity duration-200 ${!isScanning && lockedStudent ? 'opacity-0' : 'opacity-100'}`}
                    />

                    {/* Capture Flash */}
                    {showCaptureFlash && (
                        <div className="absolute inset-0 bg-white z-40 transition-opacity duration-300 pointer-events-none" />
                    )}

                    {/* HUD: Top bar with flash + gyro + scanning indicator */}
                    {isScanning && cameraOk && (
                        <>
                            <div className="absolute top-4 right-4 flex items-center space-x-2">
                                <div className="bg-black/60 px-3 py-1.5 rounded-full flex items-center space-x-2 border border-white/20">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-xs font-semibold text-white tracking-widest uppercase">Scanning</span>
                                </div>
                                <div className="bg-black/60 px-3 py-1.5 rounded-full flex items-center space-x-2 border border-white/20">
                                    <div className={`w-2.5 h-2.5 rounded-full ${'BarcodeDetector' in window ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                    <span className="text-xs font-semibold text-white tracking-widest uppercase" title="Hardware Acceleration (BarcodeDetector API)">
                                        {'BarcodeDetector' in window ? 'HW Scanner' : 'WASM Scanner'}
                                    </span>
                                </div>
                            </div>

                            {/* Flashlight toggle at bottom left to avoid mobile collisions */}
                            <div className="absolute bottom-6 left-6 z-30">
                                <Button 
                                    variant="secondary" 
                                    size="icon" 
                                    onClick={toggleFlash}
                                    disabled={!flashSupported}
                                    className={`bg-black/60 shadow-xl border-2 border-white/20 text-white rounded-full w-14 h-14 flex items-center justify-center transition-transform ${flashSupported ? 'hover:bg-black/80 active:scale-90' : 'opacity-50 cursor-not-allowed'}`}
                                    title={flashSupported ? (flashOn ? "Turn off flash" : "Turn on flash") : "Flash not supported"}
                                >
                                    {flashOn ? <Zap className="w-6 h-6 text-yellow-500 fill-yellow-500" /> : <ZapOff className="w-6 h-6" />}
                                </Button>
                            </div>

                            {/* Gyroscope Level Indicator */}
                            {gyroAvailable && (() => {
                                const level = getLevelInfo();
                                if (!level) return null;
                                return (
                                    <div className="absolute top-4 left-4 bg-black/60 px-3 py-1.5 rounded-full flex items-center space-x-2 border border-white/20">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: level.color }} />
                                        <span className="text-xs font-medium text-white">{level.label}</span>
                                    </div>
                                );
                            })()}

                            {/* MANUAL CAPTURE BUTTON — always visible at bottom center */}
                            <div className="absolute bottom-6 left-0 right-0 flex justify-center z-30 pointer-events-none">
                                <Button
                                    onClick={handleManualCapture}
                                    className="bg-white/90 hover:bg-white text-black rounded-full w-16 h-16 shadow-xl border-4 border-white/50 flex items-center justify-center transition-transform active:scale-90 pointer-events-auto"
                                    title="Manual Capture"
                                >
                                    <Crosshair className="w-7 h-7" />
                                </Button>
                            </div>
                        </>
                    )}

                    {/* Result Overlay */}
                    {!isScanning && lockedStudent && scanData && (
                        <div className="absolute inset-x-2 inset-y-2 sm:inset-x-4 sm:inset-y-4 bg-white/95 text-black rounded-xl shadow-2xl p-3 sm:p-5 flex flex-col border-2 border-primary/20 backdrop-blur-md animate-in zoom-in-95 duration-200 overflow-auto">
                            <div className="flex items-center space-x-3 mb-3">
                                <CheckCircle2 className="w-7 h-7 text-green-500 flex-shrink-0" />
                                <div>
                                    <h3 className="text-base sm:text-lg font-bold">Scan Complete — Review Before Saving</h3>
                                    <p className="text-xs text-zinc-600">Student: <strong>{lockedStudent.name}</strong> (Merit #: {lockedStudent.meritNumber})</p>
                                </div>
                            </div>
                            
                            {/* Scanned Image with Highlighted Bubbles */}
                            {scanData.imageUrl && (
                                <div className="border rounded-lg overflow-auto bg-slate-50 mb-3" style={{ maxHeight: '35vh' }}>
                                    <img src={scanData.imageUrl} alt="Scanned OMR with detected bubbles" className="w-full" />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 border rounded-lg">
                                <div>
                                    <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-1">Detected Stream</h4>
                                    <p className="text-sm sm:text-base font-bold text-primary">{scanData.stream}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-1">Detected Choices</h4>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                                        {scanData.choices.map((c, i) => (
                                            <div key={i} className="flex">
                                                <span className="w-5 text-zinc-400 font-mono">{i + 1}.</span>
                                                <span className={c ? 'font-medium' : 'text-rose-500 italic'}>{c || "—"}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <p className="text-xs text-center text-slate-500 mt-2">🟢 Green = detected filled bubble. Review the image above before saving.</p>

                            <div className="flex space-x-4 mt-3">
                                <Button variant="destructive" onClick={handleReject} className="flex-1">
                                    <RefreshCw className="w-4 h-4 mr-2" /> Rescan
                                </Button>
                                <Button onClick={handleConfirm} className="flex-1">
                                    Confirm & Save
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
