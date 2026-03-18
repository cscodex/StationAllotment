import { useState, useRef, useEffect, useCallback } from "react";
import { resizeCanvasToA4 } from "@/lib/image-utils";
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
import { UploadCloud, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { type Student } from "@shared/schema";
import {
  decodeQRHybrid,
  parseOMRImageData,
  STREAM_POS,
  GRID_ORIGIN,
  COL_STEP,
  ROW_STEP,
  CIRCLE_R_PT,
  DISTRICTS,
  STREAMS,
  drawOMROverlay
} from "@/lib/omr-utils";

interface OMRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (
    studentId: string,
    parsedData: { stream: string; choices: string[] },
  ) => void;
  expectedStudent?: Student;
  /** All students for the global scanner to look up by QR/barcode ID */
  allStudents?: Student[];
}

// ============================================================
// Component
// ============================================================
export default function OMRScannerModal({
  isOpen, onClose, onScanComplete, expectedStudent, allStudents,
}: OMRScannerModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Alignment state
  const [showAlignment, setShowAlignment] = useState(false);
  const [nudgeX, setNudgeX] = useState(0);
  const [nudgeY, setNudgeY] = useState(0);
  const [scanState, setScanState] = useState<{
    imgData: ImageData;
    toPixel: (pdfX: number, pdfY: number) => { x: number, y: number };
    sampleR: number;
    studentId: string;
    studentName?: string;
    originalImage: HTMLImageElement | null;
    markerTL: { x: number, y: number };
    markerTR: { x: number, y: number };
    markerBL: { x: number, y: number };
    markerBR: { x: number, y: number };
    qrLocation?: { topLeftCorner: { x: number; y: number }; topRightCorner: { x: number; y: number }; bottomRightCorner: { x: number; y: number }; bottomLeftCorner: { x: number; y: number } };
    barcodeLocation?: { topLeftCorner: { x: number; y: number }; topRightCorner: { x: number; y: number }; bottomRightCorner: { x: number; y: number }; bottomLeftCorner: { x: number; y: number } };
    qrFormat?: string;
    originalSizeKB: number;
  } | null>(null);

  // Overwrite confirmation
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingScanData, setPendingScanData] = useState<{
    studentId: string;
    stream: string;
    choices: string[];
    annotatedImageUrl: string;
    originalSizeKB: number;
    compressedSizeKB: number;
    qrDetected: boolean;
    barcodeDetected: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setShowAlignment(false);
      setNudgeX(0);
      setNudgeY(0);
      setScanState(null);
      setShowOverwriteConfirm(false);
      setPendingScanData(null);
    }
  }, [isOpen]);

  // Draw overlay on canvas with current nudge offsets using the proven bilinear toPixel function
  const drawOverlay = useCallback((
    canvas: HTMLCanvasElement,
    originalImg: HTMLImageElement,
    toPixel: (pdfX: number, pdfY: number) => { x: number, y: number },
    sampleR: number,
    extraNudgeX: number, extraNudgeY: number,
  ) => {
    const ctx = canvas.getContext("2d")!;
    const w = originalImg.naturalWidth;
    const h = originalImg.naturalHeight;
    canvas.width = w;
    canvas.height = h;

    // Redraw original image
    ctx.drawImage(originalImg, 0, 0, w, h);

    if (scanState) {
        const nudgedToPixel = (pdfX: number, pdfY: number) => {
          const p = toPixel(pdfX, pdfY);
          return { x: p.x + extraNudgeX, y: p.y + extraNudgeY };
        };

        drawOMROverlay(
            ctx, w, h,
            nudgedToPixel, sampleR,
            { x: scanState.markerTL.x + extraNudgeX, y: scanState.markerTL.y + extraNudgeY },
            { x: scanState.markerTR.x + extraNudgeX, y: scanState.markerTR.y + extraNudgeY },
            { x: scanState.markerBL.x + extraNudgeX, y: scanState.markerBL.y + extraNudgeY },
            { x: scanState.markerBR.x + extraNudgeX, y: scanState.markerBR.y + extraNudgeY },
            scanState.qrLocation, scanState.barcodeLocation
        );
    }
  }, [scanState]);

  // Redraw when nudge changes
  useEffect(() => {
    if (showAlignment && scanState && scanState.originalImage && canvasRef.current) {
      drawOverlay(
        canvasRef.current, scanState.originalImage,
        scanState.toPixel, scanState.sampleR,
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

      // Track original image size
      const originalSizeKB = Math.round((w * h * 4) / 1024); // rough uncompressed RGBA estimate

      // ── Step 1: QR / Barcode Detection (MANDATORY first step) ──
      let qr;
      try {
        qr = await decodeQRHybrid(imgData);
      } catch {
        throw new Error("Error scanning for QR code. The image may be corrupt or unsupported.");
      }

      if (!qr) {
        throw new Error("No QR code or barcode found. This may be an instruction page or not a valid OMR form. Please upload a filled OMR form with a visible QR code.");
      }

      let studentId: string | null = null;
      let studentName: string | null = null;
      try {
        if (qr.data.startsWith('{')) {
            const payload = JSON.parse(qr.data);
            studentId = payload.id;
            studentName = payload.appNo || null;
        } else if (qr.data.includes('-') && qr.data.length >= 36) {
            // Postgres UUIDs are 36 chars long. The barcode contains `${student.id}-${student.appNo}`
            studentId = qr.data.substring(0, 36);
            studentName = qr.data.substring(37) || qr.data; // Show the appNo
        } else {
            studentId = qr.data;
        }
      } catch {
        throw new Error("QR/Barcode found but it's not a Station Allotment form. The code contains unrecognized data.");
      }

      if (!studentId) {
        throw new Error("QR/Barcode found but it doesn't contain a valid student ID. This may not be a Station Allotment OMR form.");
      }

      // Validate against expected student if provided
      if (expectedStudent && studentId.toString() !== expectedStudent.id.toString()) {
        throw new Error(
          `Wrong form! This form belongs to ${studentName || "another student"}, but you're editing ${expectedStudent.appNo}. Please upload the correct student's form.`
        );
      }

      // ── Step 2: Use the proven parseOMRImageData with 4-corner bilinear interpolation ──
      const parsedOMR = await parseOMRImageData(imgData, 0, 0, true);
      const { toPixel, markerTL, markerTR, markerBL, markerBR } = parsedOMR;

      // Derive sampleR from the toPixel scale
      const tlPx = toPixel(42.5, 42.5);
      const trPx = toPixel(552.78, 42.5);
      const pxDist = Math.hypot(trPx.x - tlPx.x, trPx.y - tlPx.y);
      const pdfW = 510.28;
      const scale = pxDist / pdfW || (w / 595.28);
      const sampleR = CIRCLE_R_PT * scale * 0.70;

      console.log(`[OMR Upload] Image: ${w}x${h}, Scale: ${scale.toFixed(3)}, Barcode: ${qr.format || 'unknown'}`);

      // Look up student info for display in overwrite check
      if (allStudents) {
        const matched = allStudents.find(s => s.id.toString() === studentId!.toString());
        if (matched) {
          studentName = `${matched.name} (${matched.appNo})`;
        }
      }

      // Determine QR vs barcode location
      const isQRFormat = qr.format?.includes('qr') || qr.data.startsWith('{');
      const qrLocation = isQRFormat ? qr.location : undefined;
      const barcodeLocation = !isQRFormat ? qr.location : undefined;

      // ── Step 3: Show Alignment UI ──
      const origImg = el instanceof HTMLImageElement ? el : null;
      setScanState({ 
        imgData, toPixel, sampleR, studentId, studentName: studentName || undefined,
        originalImage: origImg, markerTL, markerTR, markerBL, markerBR,
        qrLocation, barcodeLocation, qrFormat: qr.format || undefined,
        originalSizeKB,
      });
      setNudgeX(0);
      setNudgeY(0);
      setShowAlignment(true);

      if (origImg) {
        drawOverlay(canvas, origImg, toPixel, sampleR, 0, 0);
      }

      toast({ title: "✅ Form Identified", description: `Student: ${studentName || studentId}. Align circles then Verify & Autofill.` });
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
    const { imgData, toPixel, sampleR, studentId } = scanState;
    const w = imgData.width;
    const h = imgData.height;

    // Apply nudge to the toPixel function
    const nudgedToPixel = (pdfX: number, pdfY: number) => {
      const p = toPixel(pdfX, pdfY);
      return { x: p.x + nudgeX, y: p.y + nudgeY };
    };

    // Import sampleIntensity from omr-utils
    const sampleIntensity = (data: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, r: number) => {
      let sum = 0, count = 0;
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x >= 0 && x < w && y >= 0 && y < h) {
            if ((x - cx) ** 2 + (y - cy) ** 2 <= r ** 2) {
              const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
              const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
              sum += gray;
              count++;
            }
          }
        }
      }
      return count > 0 ? sum / count : 255;
    };

    // Sample Stream
    const streamI: number[] = [];
    for (const s of STREAM_POS) {
      const p = nudgedToPixel(s.x, s.y);
      streamI.push(sampleIntensity(imgData.data, w, h, p.x, p.y, sampleR));
    }

    let selectedStream = "";
    const sMin = Math.min(...streamI);
    const sMax = Math.max(...streamI);
    if (sMax - sMin > 5) {
      const idx = streamI.indexOf(sMin);
      if (idx >= 0 && idx < STREAMS.length) selectedStream = STREAMS[idx];
    }

    // Sample Choices using bilinear-interpolated grid
    const choices: string[] = new Array(10).fill("");
    for (let r = 0; r < 10; r++) {
      const rowI: number[] = [];
      for (let c = 0; c < 10; c++) {
        const p = nudgedToPixel(GRID_ORIGIN.x + c * COL_STEP, GRID_ORIGIN.y + r * ROW_STEP);
        rowI.push(sampleIntensity(imgData.data, w, h, p.x, p.y, sampleR));
      }
      const rMin = Math.min(...rowI);
      const rMax = Math.max(...rowI);
      const priorityIdx = rowI.indexOf(rMin);
      console.log(`[OMR Upload] ${DISTRICTS[r]}: [${rowI.map((v) => v.toFixed(0)).join(", ")}] min=${rMin.toFixed(0)} priority=${priorityIdx + 1} gap=${(rMax - rMin).toFixed(0)}`);
      if (rMax - rMin > 5 && priorityIdx >= 0 && priorityIdx < 10) {
        choices[priorityIdx] = DISTRICTS[r];
      }
    }

    console.log(`[OMR Upload] Stream: [${streamI.map((v) => v.toFixed(0)).join(", ")}] → ${selectedStream || "N/A"}`);
    console.log(`[OMR Upload] Choices: ${choices.map((c, i) => `${i + 1}:${c || "—"}`).join(", ")}`);

    // Draw green highlights on detected bubbles for the annotated image
    if (canvasRef.current && scanState.originalImage) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d")!;
      const w2 = scanState.originalImage.naturalWidth;
      const h2 = scanState.originalImage.naturalHeight;
      canvas.width = w2;
      canvas.height = h2;
      ctx.drawImage(scanState.originalImage, 0, 0, w2, h2);

      // Green highlight on detected stream
      const streamIdx = selectedStream ? STREAMS.indexOf(selectedStream) : -1;
      for (let si = 0; si < STREAM_POS.length; si++) {
        const p = nudgedToPixel(STREAM_POS[si].x, STREAM_POS[si].y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, sampleR + 2, 0, 2 * Math.PI);
        if (si === streamIdx) {
          ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
          ctx.fill();
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 3;
        } else {
          ctx.strokeStyle = "rgba(0, 200, 200, 0.5)";
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();
      }

      // Green highlight on detected choice bubbles
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          const p = nudgedToPixel(GRID_ORIGIN.x + c * COL_STEP, GRID_ORIGIN.y + r * ROW_STEP);
          const isDetected = choices[c] === DISTRICTS[r] && choices[c] !== "";
          ctx.beginPath();
          ctx.arc(p.x, p.y, sampleR + 1, 0, 2 * Math.PI);
          if (isDetected) {
            ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
            ctx.fill();
            ctx.strokeStyle = "#22c55e";
            ctx.lineWidth = 3;
          } else {
            ctx.strokeStyle = "rgba(255, 100, 100, 0.3)";
            ctx.lineWidth = 1;
          }
          ctx.stroke();
        }
      }

      // Fiducial markers as orange crosshairs
      const markers = [scanState.markerTL, scanState.markerTR, scanState.markerBL, scanState.markerBR];
      for (const mk of markers) {
        if (!mk) continue;
        ctx.strokeStyle = "#ff6b35";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mk.x - 10, mk.y); ctx.lineTo(mk.x + 10, mk.y);
        ctx.moveTo(mk.x, mk.y - 10); ctx.lineTo(mk.x, mk.y + 10);
        ctx.stroke();
      }

      // ── Draw QR/Barcode visual indicator borders ──
      // This is now fully handled by drawOverlay which uses drawOMROverlay!
      // To ensure the final image before toBlob has the latest overlay:
      if (scanState.originalImage) {
          // Setting the state is async, so we invoke drawOverlay manually here with the exact same values
          drawOverlay(
            canvas,
            scanState.originalImage,
            toPixel,
            sampleR,
            nudgeX,
            nudgeY
          );
      }
    }

    // Generate annotated image URL
    const annotatedImageUrl = canvasRef.current?.toDataURL("image/jpeg", 0.8) || "";

    // Upload the canvas image with overlay (pre-compressed to A4 proportions)
    let compressedSizeKB = 0;
    if (canvasRef.current && studentId) {
      const resizedCanvas = resizeCanvasToA4(canvasRef.current);
      resizedCanvas.toBlob(async (blob) => {
        if (blob) {
          compressedSizeKB = Math.round(blob.size / 1024);
          // Update pending scan data with actual compressed size
          setPendingScanData(prev => prev ? { ...prev, compressedSizeKB } : prev);
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

    // Show confirmation screen (don't auto-save)
    const qrDetected = !!(scanState.qrLocation || scanState.qrFormat?.includes('qr'));
    const barcodeDetected = !!(scanState.barcodeLocation || (scanState.qrFormat && !scanState.qrFormat.includes('qr')));
    setPendingScanData({
      studentId,
      stream: selectedStream,
      choices,
      annotatedImageUrl,
      originalSizeKB: scanState.originalSizeKB,
      compressedSizeKB,
      qrDetected: qrDetected || barcodeDetected,
      barcodeDetected: barcodeDetected || qrDetected,
    });
    setShowAlignment(false);

    // Check for overwrite
    const matchedStudent = allStudents?.find(s => s.id.toString() === studentId.toString()) 
      || (expectedStudent?.id.toString() === studentId.toString() ? expectedStudent : null);

    if (matchedStudent && (matchedStudent.choice1 || matchedStudent.stream)) {
      setShowOverwriteConfirm(true);
    }
  };

  const finalizeScan = (studentId: string, stream: string, choices: string[]) => {
    toast({
      title: "Scanning Complete",
      description: `Stream: ${stream || "N/A"}. ${choices.filter(Boolean).length}/10 choices detected.`,
    });

    onScanComplete(studentId, { stream, choices });
    setShowAlignment(false);
    setScanState(null);
    setShowOverwriteConfirm(false);
    setPendingScanData(null);
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
      <DialogContent className={(showAlignment || pendingScanData) ? "w-[95vw] max-w-4xl max-h-[95vh] overflow-auto" : "sm:max-w-xl"}>
        <DialogHeader>
          <DialogTitle>Optical Form Scanner</DialogTitle>
          <DialogDescription>
            {pendingScanData
              ? `Review the detected data below. ${showOverwriteConfirm ? '⚠️ This student already has saved preferences — saving will overwrite.' : ''}`
              : showAlignment
                ? `${scanState?.studentName ? `Student: ${scanState.studentName}. ` : ""}Align the red circles with the OMR bubbles using the arrow controls, then click Verify & Autofill.`
                : expectedStudent
                  ? `Upload or scan the OMR form for ${expectedStudent.name} (${expectedStudent.appNo}).`
                  : "Upload a physical OMR form image. The system will auto-detect the student via QR code or barcode. Instruction pages without QR/barcode will be automatically skipped."}
          </DialogDescription>
        </DialogHeader>

        {/* Visual Confirmation Screen — shows after Verify & Autofill */}
        {pendingScanData ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-7 h-7 text-green-500 flex-shrink-0" />
              <div>
                <h3 className="text-base sm:text-lg font-bold">Scan Complete — Review Before Saving</h3>
                <p className="text-xs text-zinc-600">Student ID: <strong>{pendingScanData.studentId}</strong></p>
              </div>
            </div>

            {/* Overwrite Warning */}
            {showOverwriteConfirm && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700">
                  <strong>Warning:</strong> This student already has preferences saved. Confirming will overwrite the existing data.
                </p>
              </div>
            )}

            {/* Annotated Image */}
            {pendingScanData.annotatedImageUrl && (
              <div className="border rounded-lg overflow-auto bg-slate-50" style={{ maxHeight: '45vh' }}>
                <img src={pendingScanData.annotatedImageUrl} alt="Scanned OMR with detected bubbles highlighted" className="w-full" />
              </div>
            )}

            {/* Detected Values */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 border rounded-lg">
              <div>
                <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-1">Detected Stream</h4>
                <p className="text-sm sm:text-base font-bold text-primary">{pendingScanData.stream || "Not detected"}</p>
              </div>
              <div>
                <h4 className="font-semibold text-xs text-muted-foreground uppercase mb-1">Detected Choices</h4>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                  {pendingScanData.choices.map((c, i) => (
                    <div key={i} className="flex">
                      <span className="w-5 text-zinc-400 font-mono">{i + 1}.</span>
                      <span className={c ? 'font-medium' : 'text-rose-500 italic'}>{c || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Image Size and Code Detection Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 border rounded-lg">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Original</p>
                <p className="text-sm font-mono font-bold">{pendingScanData.originalSizeKB > 1024 ? `${(pendingScanData.originalSizeKB / 1024).toFixed(1)} MB` : `${pendingScanData.originalSizeKB} KB`}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Compressed</p>
                <p className="text-sm font-mono font-bold text-green-600">{pendingScanData.compressedSizeKB > 1024 ? `${(pendingScanData.compressedSizeKB / 1024).toFixed(1)} MB` : `${pendingScanData.compressedSizeKB} KB`}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">QR Code</p>
                <p className={`text-sm font-bold ${pendingScanData.qrDetected ? 'text-green-600' : 'text-red-500'}`}>
                  {pendingScanData.qrDetected ? '✓ Detected' : '✗ Not Found'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Barcode</p>
                <p className={`text-sm font-bold ${pendingScanData.barcodeDetected ? 'text-green-600' : 'text-red-500'}`}>
                  {pendingScanData.barcodeDetected ? '✓ Detected' : '✗ Not Found'}
                </p>
              </div>
            </div>

            <p className="text-xs text-center text-slate-500">🟢 Green = detected filled bubble &nbsp; 🟠 Orange = fiducial markers &nbsp; 🟩 Green border = code detected &nbsp; 🟥 Red dashed = code missing</p>

            <div className="flex space-x-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setPendingScanData(null);
                  setShowOverwriteConfirm(false);
                }}
                className="flex-1"
              >
                ← Go Back
              </Button>
              <Button
                onClick={() => finalizeScan(pendingScanData.studentId, pendingScanData.stream, pendingScanData.choices)}
                className="flex-1"
              >
                {showOverwriteConfirm ? "Overwrite & Save" : "Confirm & Save"}
              </Button>
            </div>
          </div>
        ) : showAlignment ? (
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
              🔴 Red = choice positions &nbsp; 🔵 Cyan = stream.
              Align circles over bubbles, then tap Verify & Autofill.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-6 py-6 p-4 border-2 border-dashed rounded-lg bg-slate-50 relative overflow-hidden">
            <canvas ref={canvasRef} className="hidden" />
            <div className="text-center">
              <UploadCloud className="mx-auto h-12 w-12 text-slate-400 mb-4" />
              <h3 className="text-lg font-medium text-slate-900">Upload Scanned Image</h3>
              <p className="text-sm text-slate-500 mb-4">Must be a clear JPEG/PNG of the single form page. Pages without a QR code or barcode will be rejected.</p>
              <div className="flex gap-4 justify-center">
                <Input type="file" accept="image/*" onChange={handleFileUpload} ref={fileInputRef} className="hidden" />
                <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>Browse Files</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

