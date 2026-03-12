import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UploadCloud, Save, CheckCircle2, AlertCircle, Camera, ChevronLeft, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { type Student } from "@shared/schema";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import jsQR from "jsqr";
import { parseOMRImageData, extractQRFromImage, STREAM_POS, GRID_ORIGIN, COL_STEP, ROW_STEP } from "@/lib/omr-utils";

// Initialize PDF.js worker using Vite's URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ScannedPageInfo {
    pageNumber: number;
    studentId: string | null;
    studentName?: string;
    appNo?: string;
    stream: string | null;
    choices: string[];
    status: "pending" | "processing" | "success" | "warning" | "error" | "saved";
    error?: string;
    imageBlob: Blob | null;
    thumbnailUrl: string | null;
    originalImageData?: ImageData;
    scale?: number;
    offsetX?: number;
    offsetY?: number;
    sampleR?: number;
    toPixel?: (x: number, y: number) => { x: number, y: number };
    markerTL?: { x: number, y: number };
    markerTR?: { x: number, y: number };
    markerBL?: { x: number, y: number };
    markerBR?: { x: number, y: number };
}

interface BulkScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    students: Student[];
    onSaveSelected: (pages: ScannedPageInfo[]) => Promise<void>;
}

export function BulkScannerModal({ isOpen, onClose, students, onSaveSelected }: BulkScannerModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [scannedPages, setScannedPages] = useState<ScannedPageInfo[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isConfirmOverwriteOpen, setIsConfirmOverwriteOpen] = useState(false);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const { toast } = useToast();

    // Alignment Review State
    const [reviewingIndex, setReviewingIndex] = useState<number | null>(null);
    const [nudgeX, setNudgeX] = useState(0);
    const [nudgeY, setNudgeY] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const NUDGE_STEP = 5;

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setScannedPages([]);
            setSelectedIndices([]);
        }
    };

    const processPDF = async () => {
        if (!file) return;
        setIsProcessing(true);
        setScannedPages([]);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const totalPages = pdf.numPages;

            const newPages: ScannedPageInfo[] = [];

            for (let i = 1; i <= totalPages; i++) {
                try {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR/QR

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) continue;

                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    await page.render({ canvasContext: ctx, canvas, viewport }).promise;

                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                    // 1. Extract QR safely
                    let studentId = null;
                    let matchedStudent = null;
                    try {
                        const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "dontInvert" });
                        if (code) {
                            try {
                                const parsed = JSON.parse(code.data);
                                studentId = parsed.id;
                            } catch {
                                if (code.data && !code.data.includes("{")) {
                                    studentId = code.data;
                                }
                            }
                        }
                    } catch (e) {
                        console.error("jsQR error: ", e);
                    }

                    if (studentId) {
                        matchedStudent = students.find(s => s.id === studentId);
                    }

                    // 2. Parse OMR (Circles) safely
                    let selectedStream: string | null = null;
                    let choices: string[] = [];
                    let parseData: any = null;
                    
                    try {
                        let parsedOMR = await parseOMRImageData(imgData, 0, 0, true);
                        
                        selectedStream = parsedOMR.selectedStream;
                        choices = parsedOMR.choices;
                        parseData = parsedOMR;
                        
                    } catch (e) {
                        console.error("OMR parsing catastrophic error: ", e);
                        const fallbackScale = imgData.width / 612; // PDF_W from omr-utils is 612
                        parseData = {
                            scale: fallbackScale,
                            offsetX: undefined,
                            offsetY: undefined,
                            sampleR: 6,
                            toPixel: (px: number, py: number) => ({ x: px * fallbackScale + 10, y: py * fallbackScale + 25 })
                        };
                    }

                    // 3. Create blob for uploading safely
                    let blob: Blob | null = null;
                    try {
                        blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.8));
                    } catch (e) { }

                    // 4. Create tiny thumbnail for preview scale 0.1 safely
                    let thumbnailUrl: string | null = null;
                    try {
                        const thumbCanvas = document.createElement('canvas');
                        thumbCanvas.width = canvas.width * 0.1;
                        thumbCanvas.height = canvas.height * 0.1;
                        const tCtx = thumbCanvas.getContext('2d');
                        tCtx?.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
                        thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.5);
                    } catch (e) { }

                    const hasExistingChoices = matchedStudent && [
                        matchedStudent.choice1, matchedStudent.choice2, matchedStudent.choice3, 
                        matchedStudent.choice4, matchedStudent.choice5, matchedStudent.choice6, 
                        matchedStudent.choice7, matchedStudent.choice8, matchedStudent.choice9, 
                        matchedStudent.choice10
                    ].some(c => c !== null && c !== undefined && c.trim() !== '');

                    // Stream is pre-filled on application, so we only check if they have specific choices or a physical image saved.
                    const hasExistingData = matchedStudent && (!!matchedStudent.omrImageUrl || hasExistingChoices);
                    
                    const validChoicesCount = choices.filter(c => c && c.trim() !== '').length;
                    
                    // User requested to completely silently filter out pages that are obviously instructions or covers without spamming 'Needs Review'
                    if (!matchedStudent && !selectedStream && validChoicesCount === 0) {
                         console.warn(`Silently skipping page ${i} - appears to be an instruction or non-student page.`);
                         continue;
                    }
                    
                    const status = matchedStudent && selectedStream ? (hasExistingData ? "warning" : "success") : "error";
                    const errorMsg = !matchedStudent ? "QR/Student not found or unreadable" : !selectedStream ? "Stream not detected or alignment failed" : hasExistingData ? "Scan Succeeded (Warning: Data already exists, saving will overwrite)" : undefined;

                    newPages.push({
                        pageNumber: i,
                        studentId: matchedStudent?.id || null,
                        studentName: matchedStudent?.name,
                        appNo: matchedStudent?.appNo,
                        stream: selectedStream,
                        choices,
                        status,
                        error: errorMsg,
                        imageBlob: blob,
                        thumbnailUrl,
                        originalImageData: imgData,
                        scale: parseData?.scale,
                        offsetX: parseData?.offsetX,
                        offsetY: parseData?.offsetY,
                        sampleR: parseData?.sampleR,
                        toPixel: parseData?.toPixel,
                        markerTL: parseData?.markerTL,
                        markerTR: parseData?.markerTR,
                        markerBL: parseData?.markerBL,
                        markerBR: parseData?.markerBR,
                    });

                } catch (err) {
                    console.error(`Error processing page ${i}:`, err);
                    newPages.push({
                        pageNumber: i,
                        studentId: null,
                        stream: null,
                        choices: [],
                        status: "error",
                        error: "Failed to process page",
                        imageBlob: null,
                        thumbnailUrl: null
                    });
                }
            }

            setScannedPages(newPages);
            setSelectedIndices(newPages.map((p, idx) => p.status === 'success' ? idx : -1).filter(i => i !== -1));

            toast({
                title: "Processing Complete",
                description: `Successfully scanned ${newPages.filter(p => p.status === 'success' || p.status === 'warning').length} out of ${totalPages} pages.`,
            });

        } catch (error) {
            console.error("PDF processing failed:", error);
            toast({
                title: "Processing Failed",
                description: "Could not read the PDF file.",
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleSelection = (index: number) => {
        setSelectedIndices(prev =>
            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
        );
    };

    const handleSave = async () => {
        const selected = scannedPages.filter((_, idx) => selectedIndices.includes(idx));

        // Check if any of the selected pages have the 'warning' status (meaning scan already exists)
        const hasWarnings = selected.some(p => p.status === 'warning');
        if (hasWarnings) {
            setIsConfirmOverwriteOpen(true);
            return;
        }

        await proceedWithSave(selected);
    };

    const proceedWithSave = async (selected: ScannedPageInfo[]) => {
        setIsSaving(true);
        try {
            await onSaveSelected(selected);
            // Mark as saved
            setScannedPages(prev => prev.map((p, idx) => selectedIndices.includes(idx) ? { ...p, status: "saved" } : p));
            setSelectedIndices([]); // unselect saved ones
            toast({
                title: "Saved Successfully",
                description: `Saved ${selected.length} students' preferences.`
            });
        } catch (error) {
            toast({
                title: "Save Failed",
                description: "An error occurred while saving.",
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
            setIsConfirmOverwriteOpen(false);
        }
    };

    const hasSelections = selectedIndices.length > 0;

    // --- Alignment Canvas Drawing ---
    const drawReviewOverlay = useCallback(() => {
        if (reviewingIndex === null || !canvasRef.current || !scannedPages[reviewingIndex]) return;
        const page = scannedPages[reviewingIndex];
        if (!page.originalImageData) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const imgData = page.originalImageData;
        canvas.width = imgData.width;
        canvas.height = imgData.height;

        // Restore image
        ctx.putImageData(imgData, 0, 0);

        // Explicitly use the 4-Point Bilinear Interpolator established by the parser
        // Only use brute force offsets if the parser utterly failed
        const toPixel = (pdfX: number, pdfY: number) => {
            if (page.toPixel) {
                const p = page.toPixel(pdfX, pdfY);
                return { x: p.x + nudgeX, y: p.y + nudgeY };
            }
            // Fallback
            const fallbackScale = imgData.width / 612; // PDF_W is 612 roughly
            const scale = page.scale || fallbackScale;
            const ox = (page.offsetX !== undefined ? page.offsetX : 10) + nudgeX;
            const oy = (page.offsetY !== undefined ? page.offsetY : 25) + nudgeY;
            return {
                x: pdfX * scale + ox,
                y: pdfY * scale + oy,
            };
        };

        const sampleR = page.sampleR || 6;

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
        
        // Draw Fiducial Marker Center of Mass Anchors (Blue)
        if (page.markerTL && page.markerTR && page.markerBL && page.markerBR) {
            ctx.strokeStyle = "blue";
            ctx.lineWidth = 3;
            
            const drawCrosshair = (point: {x: number, y: number}) => {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 10, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(point.x - 15, point.y);
                ctx.lineTo(point.x + 15, point.y);
                ctx.moveTo(point.x, point.y - 15);
                ctx.lineTo(point.x, point.y + 15);
                ctx.stroke();
            };

            drawCrosshair(page.markerTL);
            drawCrosshair(page.markerTR);
            drawCrosshair(page.markerBL);
            drawCrosshair(page.markerBR);
        }

    }, [reviewingIndex, scannedPages, nudgeX, nudgeY]);

    useEffect(() => {
        if (reviewingIndex !== null) {
            drawReviewOverlay();
        }
    }, [nudgeX, nudgeY, reviewingIndex, drawReviewOverlay]);

    const handleReverifyRow = async () => {
        if (reviewingIndex === null || !scannedPages[reviewingIndex] || !canvasRef.current) return;
        const page = scannedPages[reviewingIndex];
        if (!page.originalImageData) return;

        setIsProcessing(true);
        try {
            // Re-calculate the exact live math used in the Canvas overlay
            const imgData = page.originalImageData;
            const fallbackScale = imgData.width / 612;
            const scale = page.scale || fallbackScale;
            
            // Sync the exact 4-Point Bilinear Interpolator from the Canvas
            const liveToPixel = (pdfX: number, pdfY: number) => {
                if (page.toPixel) {
                    const p = page.toPixel(pdfX, pdfY);
                    return { x: p.x + nudgeX, y: p.y + nudgeY };
                }
                // Fallback geometry if extraction completely failed
                const ox = (page.offsetX !== undefined ? page.offsetX : 10) + nudgeX;
                const oy = (page.offsetY !== undefined ? page.offsetY : 25) + nudgeY;
                return {
                    x: pdfX * scale + ox,
                    y: pdfY * scale + oy,
                };
            };
            
            const liveSampleR = page.sampleR || 6;

            // Re-run the OMR sampling logic with the overridden Nudged pixel locations
            // isDigitalPdf is true to preserve the 0-margin logic
            const parsedOMR = await parseOMRImageData(
                page.originalImageData,
                nudgeX,
                nudgeY,
                true,
                liveToPixel,
                liveSampleR
            );

            // Re-capture blob with the red overlay drawn on it directly from the canvas
            const blob = await new Promise<Blob | null>(res => canvasRef.current!.toBlob(res, 'image/jpeg', 0.8));

            setScannedPages(prev => {
                const next = [...prev];
                const p = { ...next[reviewingIndex] }; // Create a new reference to force React Table update
                p.stream = parsedOMR.selectedStream;
                p.choices = parsedOMR.choices;
                p.imageBlob = blob || p.imageBlob;
                p.markerTL = parsedOMR.markerTL;
                p.markerTR = parsedOMR.markerTR;
                p.markerBL = parsedOMR.markerBL;
                p.markerBR = parsedOMR.markerBR;

                // Check for existing data to preserve the 'warning' status
                const matchedStudent = students.find(s => s.id === p.studentId);
                const hasExistingChoices = matchedStudent && [
                    matchedStudent.choice1, matchedStudent.choice2, matchedStudent.choice3, 
                    matchedStudent.choice4, matchedStudent.choice5, matchedStudent.choice6, 
                    matchedStudent.choice7, matchedStudent.choice8, matchedStudent.choice9, 
                    matchedStudent.choice10
                ].some(c => c !== null && c !== undefined && c.trim() !== '');
                // Stream is pre-filled on application, check for actual extracted choices
                const hasExistingData = matchedStudent && (!!matchedStudent.omrImageUrl || hasExistingChoices);

                // Re-calculate success
                if (p.studentId && p.stream) {
                    p.status = hasExistingData ? "warning" : "success";
                    p.error = hasExistingData ? "Scan Succeeded (Warning: Data already exists, saving will overwrite)" : undefined;
                } else {
                    p.status = "error";
                    p.error = !p.studentId ? "QR/Student not found" : "Stream not detected or alignment failed";
                }
                next[reviewingIndex] = p; // Ensure the new reference overwrites the array index
                return next;
            });

            // If it succeeded, auto-select it
            if (parsedOMR.selectedStream && page.studentId && !selectedIndices.includes(reviewingIndex)) {
                setSelectedIndices(prev => [...prev, reviewingIndex]);
            }

            toast({ title: "Updated", description: `Stream and choices reverified correctly.` });
            setReviewingIndex(null);
        } catch (err: any) {
            toast({ title: "Reverification Failed", description: err.message || "Failed to parse choices.", variant: "destructive" });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCloseReview = () => {
        setReviewingIndex(null);
        setNudgeX(0);
        setNudgeY(0);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={reviewingIndex !== null ? "w-[95vw] max-w-5xl max-h-[95vh] flex flex-col overflow-auto" : "max-w-5xl max-h-[90vh] flex flex-col"}>
                <DialogHeader>
                    <DialogTitle>Bulk Scan OMR Submissions</DialogTitle>
                    <DialogDescription>
                        Upload a merged PDF containing multiple students' OMR form front pages. The system will automatically detect the QR codes and filled preferences.
                    </DialogDescription>
                </DialogHeader>

                {!scannedPages.length && !isProcessing && (
                    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg bg-muted/50">
                        <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            id="bulk-pdf-upload"
                            onChange={handleFileUpload}
                        />
                        <label
                            htmlFor="bulk-pdf-upload"
                            className="flex flex-col items-center cursor-pointer text-muted-foreground hover:text-primary transition-colors"
                        >
                            <UploadCloud className="w-12 h-12 mb-4" />
                            <span className="text-sm font-medium">Click to upload a unified PDF</span>
                            {file && <span className="mt-2 text-primary">{file.name}</span>}
                        </label>
                        {file && (
                            <Button onClick={processPDF} className="mt-6" disabled={isProcessing}>
                                Start Processing
                            </Button>
                        )}
                    </div>
                )}

                {isProcessing && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                        <p className="text-sm text-muted-foreground">Parsing PDF and scanning forms... This may take a few moments.</p>
                    </div>
                )}

                {reviewingIndex !== null && scannedPages[reviewingIndex] && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" onClick={handleCloseReview}><ChevronLeft className="w-4 h-4 mr-2" /> Back to List</Button>
                            <h3 className="font-semibold text-lg">Adjust Page {scannedPages[reviewingIndex].pageNumber} (Student: {scannedPages[reviewingIndex].studentName || "Unknown"})</h3>
                            <Button onClick={handleReverifyRow} disabled={isProcessing}>
                                {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                Verify & Update
                            </Button>
                        </div>

                        <div className="flex justify-center mb-2">
                            <div className="bg-muted p-2 rounded-lg flex gap-4">
                                <div className="flex flex-col items-center">
                                    <span className="text-xs font-medium mb-1 text-muted-foreground">Adjust Y: {nudgeY}px</span>
                                    <div className="flex flex-col gap-1">
                                        <Button size="icon" variant="outline" onClick={() => setNudgeY(nudgeY - NUDGE_STEP)} className="h-8 w-8"><ArrowUp className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="outline" onClick={() => setNudgeY(nudgeY + NUDGE_STEP)} className="h-8 w-8"><ArrowDown className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center justify-center">
                                    <span className="text-xs font-medium mb-1 text-muted-foreground">Adjust X: {nudgeX}px</span>
                                    <div className="flex gap-1">
                                        <Button size="icon" variant="outline" onClick={() => setNudgeX(nudgeX - NUDGE_STEP)} className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="outline" onClick={() => setNudgeX(nudgeX + NUDGE_STEP)} className="h-8 w-8"><ArrowRight className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center justify-end">
                                    <Button variant="ghost" size="sm" onClick={() => { setNudgeX(0); setNudgeY(0); }} className="h-8 text-xs">Reset</Button>
                                </div>
                            </div>
                        </div>

                        <div className="border border-input rounded-md overflow-hidden bg-muted/30">
                            <canvas
                                ref={canvasRef}
                                className="max-w-full h-auto mx-auto object-contain max-h-[60vh] drop-shadow-md bg-white"
                            />
                        </div>
                    </div>
                )}

                {scannedPages.length > 0 && !isProcessing && reviewingIndex === null && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-sm">Scan Results ({scannedPages.length} Pages)</h3>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => { setFile(null); setScannedPages([]); }}>Upload New</Button>
                                <Button onClick={handleSave} disabled={!hasSelections || isSaving} size="sm">
                                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Selected ({selectedIndices.length})
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">
                                            <Checkbox
                                                checked={selectedIndices.length === scannedPages.filter(p => p.status === 'success' || p.status === 'warning').length && selectedIndices.length > 0}
                                                onCheckedChange={(c) => {
                                                    if (c) setSelectedIndices(scannedPages.map((p, i) => (p.status === 'success' || p.status === 'warning') ? i : -1).filter(i => i !== -1));
                                                    else setSelectedIndices([]);
                                                }}
                                            />
                                        </TableHead>
                                        <TableHead>Pg</TableHead>
                                        <TableHead>Preview</TableHead>
                                        <TableHead>Student</TableHead>
                                        <TableHead>Stream</TableHead>
                                        <TableHead>Choices</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {scannedPages.map((page, idx) => (
                                        <TableRow key={idx}
                                            className={`cursor-pointer transition-colors ${page.status === 'error' ? "bg-red-50/50 hover:bg-red-50" : page.status === 'warning' ? "bg-orange-50/50 hover:bg-orange-50" : page.status === 'saved' ? "bg-emerald-50/50 opacity-50" : "hover:bg-muted/50"}`}
                                            onClick={() => {
                                                if (page.status !== 'saved') {
                                                    setReviewingIndex(idx);
                                                    setNudgeX(0);
                                                    setNudgeY(0);
                                                }
                                            }}
                                        >
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={selectedIndices.includes(idx)}
                                                    onCheckedChange={() => toggleSelection(idx)}
                                                    disabled={page.status === 'error' || page.status === 'saved'}
                                                />
                                            </TableCell>
                                            <TableCell>{page.pageNumber}</TableCell>
                                            <TableCell>
                                                {page.thumbnailUrl ? (
                                                    <img src={page.thumbnailUrl} alt={`Pg ${page.pageNumber}`} className="h-10 w-8 border rounded object-cover cursor-pointer hover:scale-150 transition-transform" />
                                                ) : <Camera className="w-6 h-6 text-muted-foreground" />}
                                            </TableCell>
                                            <TableCell>
                                                {page.studentName ? (
                                                    <div>
                                                        <p className="font-medium text-sm">{page.studentName}</p>
                                                        <p className="text-xs text-muted-foreground">{page.appNo}</p>
                                                    </div>
                                                ) : (
                                                    <span className="text-red-500 text-sm font-medium block">Not Found</span>
                                                )}
                                                {page.error && <p className="text-xs text-red-500 flex items-center mt-1"><AlertCircle className="w-3 h-3 mr-1" />{page.error}</p>}
                                            </TableCell>
                                            <TableCell>
                                                {page.stream ? <Badge variant="outline">{page.stream}</Badge> : <span className="text-muted-foreground">-</span>}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {page.choices.filter(Boolean).length}/10 Detected
                                            </TableCell>
                                            <TableCell>
                                                {page.status === 'success' && <Badge className="bg-emerald-500">Ready</Badge>}
                                                {page.status === 'warning' && <Badge className="bg-orange-500 hover:bg-orange-600">Succeeded (Overwrite)</Badge>}
                                                {page.status === 'error' && <Badge variant="destructive">Needs Review</Badge>}
                                                {page.status === 'saved' && <Badge className="bg-slate-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Saved</Badge>}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}
            </DialogContent>
            <AlertDialog open={isConfirmOverwriteOpen} onOpenChange={setIsConfirmOverwriteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Overwrite Existing Scans?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have selected one or more students who already have an existing OMR scan in the system.
                            Proceeding will overwrite their existing scan and preferences with this new bulk upload. Are you sure you want to continue?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            const selected = scannedPages.filter((_, idx) => selectedIndices.includes(idx));
                            proceedWithSave(selected);
                        }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Yes, Overwrite
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}
export type { ScannedPageInfo };
