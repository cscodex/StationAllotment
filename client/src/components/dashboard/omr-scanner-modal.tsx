import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import jsQR from "jsqr";
import { UploadCloud, Camera, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { type Student } from "@shared/schema";

interface OMRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (
    studentId: string,
    parsedData: { stream: string; choices: string[] },
  ) => void;
  expectedStudent?: Student;
}

// ============================================================
// PDF Layout Constants (from server/omrService.ts)
// Y positions are "from top-left" for image coordinate consistency.
// ============================================================
const PDF_W = 612;
const PDF_H = 792;

// Fiducial markers: markerSize=25, padding=30
const MARKER_TL = { x: 42.5, y: 42.5 };
const MARKER_TR = { x: 569.5, y: 42.5 };
const MARKER_SIZE_PT = 25;

// Stream circles (from top-left in PDF points)
const STREAM_POS = [
  { x: 150, y: 246 },
  { x: 270, y: 246 },
  { x: 390, y: 246 },
];

// Choice grid (from top-left in PDF points)
const GRID_ORIGIN = { x: 150, y: 350 };
const COL_STEP = 35;
const ROW_STEP = 35;
const CIRCLE_R_PT = 8;

const DISTRICTS = [
  "Amritsar", "Bathinda", "Ferozepur", "Gurdaspur", "Jalandhar",
  "Ludhiana", "Patiala", "SAS Nagar (Mohali)", "Sangrur", "Talwara",
];
const STREAMS = ["Medical", "NonMedical", "Commerce"];

// ============================================================
// Helpers
// ============================================================

function sampleIntensity(
  data: Uint8ClampedArray, w: number, h: number,
  cx: number, cy: number, r: number,
): number {
  const rad = Math.max(1, Math.floor(r));
  let sum = 0, n = 0;
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px >= 0 && px < w && py >= 0 && py < h) {
        const i = (py * w + px) * 4;
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        n++;
      }
    }
  }
  return n > 0 ? sum / n : 255;
}

/**
 * Find a fiducial marker using sliding-window darkest-block approach.
 */
function findMarker(
  data: Uint8ClampedArray, w: number, h: number,
  approxX: number, approxY: number, markerPx: number,
): { x: number; y: number } {
  const half = Math.floor(markerPx / 2);
  const searchR = Math.floor(markerPx * 1.5);
  const step = Math.max(1, Math.floor(markerPx / 8));
  let bestX = approxX, bestY = approxY, bestAvg = 255;

  for (let cy = approxY - searchR; cy <= approxY + searchR; cy += step) {
    for (let cx = approxX - searchR; cx <= approxX + searchR; cx += step) {
      let sum = 0, count = 0;
      for (let dy = -half; dy <= half; dy += step) {
        for (let dx = -half; dx <= half; dx += step) {
          const px = Math.round(cx + dx);
          const py = Math.round(cy + dy);
          if (px >= 0 && px < w && py >= 0 && py < h) {
            const i = (py * w + px) * 4;
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            count++;
          }
        }
      }
      const avg = count > 0 ? sum / count : 255;
      if (avg < bestAvg) { bestAvg = avg; bestX = cx; bestY = cy; }
    }
  }
  return { x: bestX, y: bestY };
}

// ============================================================
// Component
// ============================================================
export default function OMRScannerModal({
  isOpen, onClose, onScanComplete, expectedStudent,
}: OMRScannerModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useCamera, setUseCamera] = useState(false);

  // Alignment state
  const [showAlignment, setShowAlignment] = useState(false);
  const [nudgeX, setNudgeX] = useState(0);
  const [nudgeY, setNudgeY] = useState(0);
  const [scanState, setScanState] = useState<{
    imgData: ImageData;
    w: number; h: number;
    scale: number; offsetX: number; offsetY: number;
    sampleR: number;
    studentId: string;
    payload: any;
    originalImage: HTMLImageElement | null;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setShowAlignment(false);
      setNudgeX(0);
      setNudgeY(0);
      setScanState(null);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        setUseCamera(false);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    let raf: number;
    const scan = async () => {
      if (useCamera && videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        try { await processImage(videoRef.current, true); } catch { }
      }
      if (useCamera) raf = requestAnimationFrame(scan);
    };
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play();
          requestAnimationFrame(scan);
        }
      } catch {
        toast({ title: "Camera Access Denied", description: "Please allow camera access.", variant: "destructive" });
        setUseCamera(false);
      }
    };
    if (useCamera) start();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [useCamera]);

  // Draw overlay on canvas with current nudge offsets
  const drawOverlay = useCallback((
    canvas: HTMLCanvasElement,
    originalImg: HTMLImageElement,
    scale: number, baseOffsetX: number, baseOffsetY: number, sampleR: number,
    extraNudgeX: number, extraNudgeY: number,
  ) => {
    const ctx = canvas.getContext("2d")!;
    const w = originalImg.naturalWidth;
    const h = originalImg.naturalHeight;
    canvas.width = w;
    canvas.height = h;

    // Redraw original image
    ctx.drawImage(originalImg, 0, 0, w, h);

    const ox = baseOffsetX + extraNudgeX;
    const oy = baseOffsetY + extraNudgeY;

    const toPixel = (pdfX: number, pdfY: number) => ({
      x: pdfX * scale + ox,
      y: pdfY * scale + oy,
    });

    // Draw stream positions (magenta)
    ctx.strokeStyle = "magenta";
    ctx.lineWidth = 3;
    for (const s of STREAM_POS) {
      const p = toPixel(s.x, s.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, sampleR, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Draw choice grid (red)
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const p = toPixel(GRID_ORIGIN.x + c * COL_STEP, GRID_ORIGIN.y + r * ROW_STEP);
        ctx.beginPath();
        ctx.arc(p.x, p.y, sampleR, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }, []);

  // Redraw when nudge changes
  useEffect(() => {
    if (showAlignment && scanState && scanState.originalImage && canvasRef.current) {
      drawOverlay(
        canvasRef.current, scanState.originalImage,
        scanState.scale, scanState.offsetX, scanState.offsetY, scanState.sampleR,
        nudgeX, nudgeY,
      );
    }
  }, [nudgeX, nudgeY, showAlignment, scanState, drawOverlay]);

  const processImage = async (el: HTMLImageElement | HTMLVideoElement, silent = false) => {
    setIsProcessing(true);
    try {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Could not initialize image processing. Please try a different browser.");
      }

      const w = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
      const h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;

      if (!w || !h || w < 200 || h < 200) {
        throw new Error("Image is too small or could not be loaded. Please use a clearer, larger image (at least 200×200 pixels).");
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(el, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);

      // ── Step 1: QR Code Detection ──
      let qr;
      try {
        qr = jsQR(imgData.data, w, h, { inversionAttempts: "attemptBoth" });
      } catch {
        throw new Error("Error scanning for QR code. The image may be corrupt or unsupported.");
      }

      if (!qr) {
        throw new Error("No QR code found. This doesn't appear to be a valid Station Allotment OMR form. Please upload the correct form image.");
      }

      let payload: any;
      try {
        payload = JSON.parse(qr.data);
      } catch {
        throw new Error("QR code found but it's not a Station Allotment form. The QR code contains unrecognized data.");
      }

      const studentId = payload?.id;
      if (!studentId) {
        throw new Error("QR code found but it doesn't contain a valid student ID. This may not be a Station Allotment OMR form.");
      }

      if (expectedStudent && studentId !== expectedStudent.id) {
        throw new Error(
          `Wrong form! This form belongs to ${payload.appNo || "another student"}, but you're editing ${expectedStudent.appNo}. Please upload the correct student's form.`
        );
      }

      // ── Step 2: Locate Fiducial Markers ──
      const roughScale = w / PDF_W;
      if (roughScale < 1 || roughScale > 20) {
        throw new Error("Image dimensions don't match expected OMR form proportions. Please upload a full-page scan or export.");
      }

      const markerPx = Math.round(MARKER_SIZE_PT * roughScale);

      const tlApprox = { x: MARKER_TL.x * roughScale, y: MARKER_TL.y * roughScale };
      const trApprox = { x: MARKER_TR.x * roughScale, y: MARKER_TR.y * roughScale };

      const tl = findMarker(imgData.data, w, h, tlApprox.x, tlApprox.y, markerPx);
      const tr = findMarker(imgData.data, w, h, trApprox.x, trApprox.y, markerPx);

      const pdfDist = MARKER_TR.x - MARKER_TL.x;
      const pxDist = Math.hypot(tr.x - tl.x, tr.y - tl.y);

      if (pxDist < 100) {
        throw new Error("Could not locate the corner alignment markers. Ensure the full form page is visible including the black squares in the corners.");
      }

      const scale = pxDist / pdfDist;

      const offsetX = tl.x - MARKER_TL.x * scale + 40;
      const offsetY = tl.y - MARKER_TL.y * scale + 55;
      const sampleR = CIRCLE_R_PT * scale * 0.70;

      console.log(`[OMR] Image: ${w}x${h}, TL:(${tl.x.toFixed(0)},${tl.y.toFixed(0)}), TR:(${tr.x.toFixed(0)},${tr.y.toFixed(0)})`);
      console.log(`[OMR] Scale: ${scale.toFixed(3)}, Offset: (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`);

      // ── Step 3: Show Alignment UI ──
      const origImg = el instanceof HTMLImageElement ? el : null;
      setScanState({ imgData, w, h, scale, offsetX, offsetY, sampleR, studentId, payload, originalImage: origImg });
      setNudgeX(0);
      setNudgeY(0);
      setShowAlignment(true);

      if (origImg) {
        drawOverlay(canvas, origImg, scale, offsetX, offsetY, sampleR, 0, 0);
      }

      toast({ title: "Grid Overlay Ready", description: "Align the red circles with the OMR bubbles, then click Verify & Autofill." });
    } catch (error: any) {
      if (!silent) {
        toast({ title: "Scan Failed", description: error.message || "An unexpected error occurred. Please try again with a different image.", variant: "destructive" });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyAndAutofill = () => {
    if (!scanState) return;
    const { imgData, w, h, scale, offsetX, offsetY, sampleR, studentId, payload } = scanState;

    const ox = offsetX + nudgeX;
    const oy = offsetY + nudgeY;

    const toPixel = (pdfX: number, pdfY: number) => ({
      x: pdfX * scale + ox,
      y: pdfY * scale + oy,
    });

    // Sample Stream
    const streamI: number[] = [];
    for (const s of STREAM_POS) {
      const p = toPixel(s.x, s.y);
      streamI.push(sampleIntensity(imgData.data, w, h, p.x, p.y, sampleR));
    }

    let selectedStream = "";
    const sMin = Math.min(...streamI);
    const sMax = Math.max(...streamI);
    if (sMax - sMin > 25) {
      const idx = streamI.indexOf(sMin);
      if (idx >= 0 && idx < STREAMS.length) selectedStream = STREAMS[idx];
    }

    // Sample Transposed Grid: rows = districts, cols = priority numbers
    // For each district row, find the filled column → that's the priority number
    const choices: string[] = new Array(10).fill("");
    for (let r = 0; r < 10; r++) {
      const rowI: number[] = [];
      for (let c = 0; c < 10; c++) {
        const p = toPixel(GRID_ORIGIN.x + c * COL_STEP, GRID_ORIGIN.y + r * ROW_STEP);
        rowI.push(sampleIntensity(imgData.data, w, h, p.x, p.y, sampleR));
      }
      const rMin = Math.min(...rowI);
      const rMax = Math.max(...rowI);
      const priorityIdx = rowI.indexOf(rMin);
      console.log(`[OMR] ${DISTRICTS[r]}: [${rowI.map((v) => v.toFixed(0)).join(", ")}] min=${rMin.toFixed(0)} priority=${priorityIdx + 1} gap=${(rMax - rMin).toFixed(0)}`);
      if (rMax - rMin > 25 && priorityIdx >= 0 && priorityIdx < 10) {
        // This district is the student's (priorityIdx+1)th choice
        choices[priorityIdx] = DISTRICTS[r];
      }
    }

    console.log(`[OMR] Stream: [${streamI.map((v) => v.toFixed(0)).join(", ")}] → ${selectedStream || "N/A"}`);
    console.log(`[OMR] Choices: ${choices.map((c, i) => `${i + 1}:${c || "—"}`).join(", ")}`);

    toast({
      title: "Scanning Complete",
      description: `Stream: ${selectedStream || "N/A"}. ${choices.filter(Boolean).length}/10 choices detected.`,
    });

    const dbStream = selectedStream;

    // Upload the canvas image with overlay
    if (canvasRef.current && studentId) {
      canvasRef.current.toBlob(async (blob) => {
        if (blob) {
          const formData = new FormData();
          formData.append('image', blob, `omr_scan_${studentId}.jpg`);
          try {
            await fetch(`/api/students/${studentId}/omr-image`, {
              method: 'POST',
              body: formData,
            });
          } catch (err) {
            console.error("Failed to upload OMR image", err);
          }
        }
      }, 'image/jpeg', 0.8);
    }

    onScanComplete(studentId as string, { stream: dbStream, choices });
    setShowAlignment(false);
    setScanState(null);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => processImage(img);
    img.src = URL.createObjectURL(file);
  };

  // Nudge step in pixels (each click shifts grid by this many pixels)
  const NUDGE_STEP = 5;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={showAlignment ? "w-[95vw] max-w-4xl max-h-[95vh] overflow-auto" : "sm:max-w-xl"}>
        <DialogHeader>
          <DialogTitle>Optical Form Scanner</DialogTitle>
          <DialogDescription>
            {showAlignment
              ? "Align the red circles with the OMR bubbles using the arrow controls, then click Verify & Autofill."
              : expectedStudent
                ? `Upload or scan the OMR form for ${expectedStudent.name} (${expectedStudent.appNo}).`
                : "Upload a physical OMR form. The system will auto-detect the student via QR code."}
          </DialogDescription>
        </DialogHeader>

        {showAlignment ? (
          <div className="flex flex-col gap-3">
            {/* Alignment Controls - stacks on mobile */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-slate-100 rounded-lg p-3 gap-2">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-700">Adjust Grid:</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={() => setNudgeX((n) => n - NUDGE_STEP)}>
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={() => setNudgeY((n) => n - NUDGE_STEP)}>
                    <ArrowUp className="w-5 h-5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={() => setNudgeY((n) => n + NUDGE_STEP)}>
                    <ArrowDown className="w-5 h-5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={() => setNudgeX((n) => n + NUDGE_STEP)}>
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </div>
                <span className="text-xs text-slate-500">
                  ({nudgeX}, {nudgeY})
                </span>
              </div>
              <div className="flex gap-2 justify-center sm:justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setNudgeX(0); setNudgeY(0); }}>
                  Reset
                </Button>
                <Button size="sm" onClick={handleVerifyAndAutofill} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Verify & Autofill
                </Button>
              </div>
            </div>

            {/* Canvas - scrollable on touch, pinch-zoomable */}
            <div
              className="border-2 border-slate-300 rounded-lg overflow-auto bg-slate-50"
              style={{ maxHeight: "60vh", WebkitOverflowScrolling: "touch" }}
            >
              <canvas
                ref={canvasRef}
                style={{ maxWidth: "100%", display: "block" }}
              />
            </div>

            <p className="text-xs text-slate-500 text-center">
              🔴 Red = choice positions &nbsp; 🟣 Magenta = stream.
              Align circles over bubbles, then tap Verify & Autofill.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-6 py-6 p-4 border-2 border-dashed rounded-lg bg-slate-50 relative overflow-hidden">
            <canvas ref={canvasRef} className="hidden" />
            {useCamera ? (
              <div className="w-full flex justify-center relative bg-black rounded overflow-hidden shadow-inner">
                <video ref={videoRef} className="w-full h-[300px] object-cover" />
                <div className="absolute inset-0 border-4 border-primary/50 pointer-events-none rounded m-4 flex flex-col items-center justify-center">
                  <div className="w-48 h-48 border-2 border-dashed border-white opacity-50 relative animate-pulse">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-400 -mt-1 -ml-1" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-400 -mt-1 -mr-1" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-400 -mb-1 -ml-1" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-400 -mb-1 -mr-1" />
                  </div>
                  <p className="text-white bg-black/50 px-3 py-1 rounded-full mt-4 text-xs font-medium backdrop-blur-sm">
                    Align form inside grid...
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <UploadCloud className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">Upload Scanned Image</h3>
                <p className="text-sm text-slate-500 mb-4">Must be a clear JPEG/PNG of the single form page.</p>
                <div className="flex gap-4 justify-center">
                  <Input type="file" accept="image/*" onChange={handleFileUpload} ref={fileInputRef} className="hidden" />
                  <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>Browse Files</Button>
                  <Button variant="outline" onClick={() => setUseCamera(true)} disabled={isProcessing}>
                    <Camera className="w-4 h-4 mr-2" />Use Camera
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
