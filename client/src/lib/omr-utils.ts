import { type Student } from "@shared/schema";
import { readBarcodesFromImageData } from "zxing-wasm/reader";

export const PDF_W = 595.28;
export const PDF_H = 841.89;

// Fiducial markers (Center of the 25x25 squares padded 30px from edge)
export const MARKER_TL = { x: 42.5, y: 42.5 };
export const MARKER_TR = { x: 552.78, y: 42.5 };
export const MARKER_BL = { x: 42.5, y: 799.39 };
export const MARKER_BR = { x: 552.78, y: 799.39 };
export const MARKER_SIZE_PT = 25;

// Stream selection circles (based on exact X/Y offsets from original PDF outputs)
// PDF uses Bottom-Left origin. QR Y=h-170 -> Canvas Y=170. Stream Y=h-250 -> Canvas Y=250.
export const STREAM_POS = [
    { x: 150, y: 246 }, // Medical
    { x: 270, y: 246 }, // NonMedical
    { x: 390, y: 246 }, // Commerce
];

export const GRID_ORIGIN = { x: 150, y: 346 };
export const COL_STEP = 35;
export const ROW_STEP = 35; 
export const CIRCLE_R_PT = 8;

export const DISTRICTS = [
    "Amritsar", "Bathinda", "Ferozepur", "Gurdaspur", "Jalandhar",
    "Ludhiana", "Patiala", "SAS Nagar (Mohali)", "Sangrur", "Talwara",
];
export const STREAMS = ["Medical", "NonMedical", "Commerce"];



export function sampleIntensity(data: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, r: number) {
    let sum = 0;
    let count = 0;
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
}

export function findMarker(data: Uint8ClampedArray, w: number, h: number, startX: number, startY: number, searchRadius: number, corner?: "TL" | "TR" | "BL" | "BR") {
    let minInt = 255;
    let minX = startX;
    let minY = startY;
    
    // 1. Find the absolute minimum intensity in the search area
    for (let y = startY - searchRadius; y <= startY + searchRadius; y += 2) {
        for (let x = startX - searchRadius; x <= startX + searchRadius; x += 2) {
            if (x < 0 || x >= w || y < 0 || y >= h) continue;

            // Strict Directional Clamping: Prevent the search space from wandering inwards 
            // towards the center of the page where false positives like Signature Lines exist.
            if (corner) {
                if (corner === "TL" && (x > startX + searchRadius/2 || y > startY + searchRadius/2)) continue;
                if (corner === "TR" && (x < startX - searchRadius/2 || y > startY + searchRadius/2)) continue;
                if (corner === "BL" && (x > startX + searchRadius/2 || y < startY - searchRadius/2)) continue;
                if (corner === "BR" && (x < startX - searchRadius/2 || y < startY - searchRadius/2)) continue;
            }

            const intensity = sampleIntensity(data, w, h, x, y, Math.floor(MARKER_SIZE_PT / 2));
            if (intensity < minInt) {
                minInt = intensity;
                minX = x;
                minY = y;
            }
        }
    }
    
    // 2. Find the center of mass STRICTLY around the detected darkest core.
    // This prevents massive dark background objects (like black shirts) from pulling the mathematical gravity away from the fiducial.
    let sumX = 0, sumY = 0, count = 0;
    const tightRadius = Math.max(10, Math.floor(searchRadius * 0.4)); // The marker is small, so only look in its immediate vicinity 
    
    for (let y = minY - tightRadius; y <= minY + tightRadius; y += 1) {
        for (let x = minX - tightRadius; x <= minX + tightRadius; x += 1) {
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            const intensity = sampleIntensity(data, w, h, x, y, 1);
            if (intensity <= minInt + 25) { // 25 tolerance captures uniform black areas including glare
                sumX += x;
                sumY += y;
                count++;
            }
        }
    }
    
    let bestP = { x: minX, y: minY };
    if (count > 0) {
        bestP = { x: sumX / count, y: sumY / count };
    }

    return { ...bestP, intensity: minInt };
}

export function drawTarget(ctx: CanvasRenderingContext2D, center: { x: number; y: number }, radius: number, color: string) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(center.x - radius - 5, center.y);
    ctx.lineTo(center.x + radius + 5, center.y);
    ctx.moveTo(center.x, center.y - radius - 5);
    ctx.lineTo(center.x, center.y + radius + 5);
    ctx.stroke();
}

/**
 * Extracts QR code from image element
 */
export async function extractQRFromImage(img: HTMLImageElement): Promise<{ studentId: string | null; qrBounds: any | null }> {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    if (!ctx) return { studentId: null, qrBounds: null };
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, c.width, c.height);

    try {
        const results = await readBarcodesFromImageData(imgData, { formats: ['QRCode'], maxNumberOfSymbols: 1 });
        if (results && results.length > 0) {
            const data = results[0].text;
            const location = results[0].position;

            try {
                const parsed = JSON.parse(data);
                if (parsed.id) return { studentId: parsed.id, qrBounds: location };
            } catch {
                // Direct string format fallback
                if (data && data.length > 5 && !data.includes("{")) {
                    return { studentId: data, qrBounds: location };
                }
            }
            return { studentId: data, qrBounds: location };
        }
    } catch (err) {}

    return { studentId: null, qrBounds: null };
}

/**
 * Parses image logic from ImageData to extract streams and choices
 */
export async function parseOMRImageData(
    imgData: ImageData,
    nudgeX: number,
    nudgeY: number,
    isDigitalPdf: boolean = false,
    overrideToPixel?: (pdfX: number, pdfY: number) => { x: number, y: number },
    overrideSampleR?: number,
    anchor?: { scale: number, angle: number, qrX: number, qrY: number, qrPhysicalX: number, qrPhysicalY: number }
) {
    const w = imgData.width;
    const h = imgData.height;

    let toPixel: (pdfX: number, pdfY: number) => { x: number, y: number };
    let sampleR: number;

    let expectedTL, expectedTR, expectedBL, expectedBR;

    // If a physical anchor is provided (like from a webcam QR code), calculate exact relative rotated 3D locations
    if (anchor) {
        const { scale, angle, qrX, qrY, qrPhysicalX, qrPhysicalY } = anchor;
        const rotate = (px: number, py: number, a: number) => ({
            x: px * Math.cos(a) - py * Math.sin(a),
            y: px * Math.sin(a) + py * Math.cos(a)
        });

        // Compute where the physical dot should be relative to the QR code, applying matrix rotation
        const getExpected = (mx: number, my: number) => {
            const rx = (mx - qrPhysicalX) * scale;
            const ry = (my - qrPhysicalY) * scale;
            const rotated = rotate(rx, ry, angle);
            return { x: qrX + rotated.x, y: qrY + rotated.y };
        };

        expectedTL = getExpected(MARKER_TL.x, MARKER_TL.y);
        expectedTR = getExpected(MARKER_TR.x, MARKER_TR.y);
        expectedBL = getExpected(MARKER_BL.x, MARKER_BL.y);
        expectedBR = getExpected(MARKER_BR.x, MARKER_BR.y);
    } else {
        const roughScale = w / PDF_W;
        expectedTL = { x: MARKER_TL.x * roughScale, y: MARKER_TL.y * roughScale };
        expectedTR = { x: MARKER_TR.x * roughScale, y: MARKER_TR.y * roughScale };
        expectedBL = { x: MARKER_BL.x * roughScale, y: h - (MARKER_TL.y * roughScale) };
        expectedBR = { x: MARKER_BR.x * roughScale, y: h - (MARKER_TL.y * roughScale) };
    }

    // Use a wider search radius for manual camera captures (150) because user prints ("Fit to page")
    // often break the strict A4 aspect ratio. Our new directional clamping prevents it from snapping to signatures.
    const searchRadius = Math.floor((anchor ? 40 : 150) * (anchor ? anchor.scale : w / PDF_W));
    
    const mTL = findMarker(imgData.data, w, h, expectedTL.x, expectedTL.y, searchRadius, "TL");
    const mTR = findMarker(imgData.data, w, h, expectedTR.x, expectedTR.y, searchRadius, "TR");
    const mBL = findMarker(imgData.data, w, h, expectedBL.x, expectedBL.y, searchRadius + (anchor ? 10 : 30 * (w/PDF_W)), "BL");
    const mBR = findMarker(imgData.data, w, h, expectedBR.x, expectedBR.y, searchRadius + (anchor ? 10 : 30 * (w/PDF_W)), "BR");
    
    let markerTL = { x: mTL.x, y: mTL.y };
    let markerTR = { x: mTR.x, y: mTR.y };
    let markerBL = { x: mBL.x, y: mBL.y };
    let markerBR = { x: mBR.x, y: mBR.y };

    if (overrideToPixel && overrideSampleR) {
        toPixel = overrideToPixel;
        sampleR = overrideSampleR;
    } else {
        // Bilinear Interpolation using all 4 corners
        // The theoretical, perfect distances between the Center-Of-Mass of the fiducials on an A4 page
        const pdfW = 510.28; // 552.78 - 42.5
        const pdfH = 756.89; // 799.39 - 42.5

        toPixel = (pdfX: number, pdfY: number) => {
            // Normalized coordinates (0.0 to 1.0) inside the fiducial bounding box
            const tx = (pdfX - MARKER_TL.x) / pdfW;
            const ty = (pdfY - MARKER_TL.y) / pdfH;

            // Bilinear interpolation formula
            const px = (1 - tx) * (1 - ty) * mTL.x + tx * (1 - ty) * mTR.x + (1 - tx) * ty * mBL.x + tx * ty * mBR.x;
            const py = (1 - tx) * (1 - ty) * mTL.y + tx * (1 - ty) * mTR.y + (1 - tx) * ty * mBL.y + tx * ty * mBR.y;

            return {
                x: px + (isDigitalPdf ? 0 : nudgeX),
                y: py + (isDigitalPdf ? 0 : nudgeY),
            };
        };

        // Derive average scale from horizontal top distance for the bubble sampling radius
        const pxDist = Math.hypot(mTR.x - mTL.x, mTR.y - mTL.y);
        const scale = pxDist / pdfW || (w / PDF_W);
        sampleR = CIRCLE_R_PT * scale * 0.70;
    }

    // 1. Read Stream
    const streamI = STREAM_POS.map(pos => {
        const p = toPixel(pos.x, pos.y);
        return sampleIntensity(imgData.data, w, h, p.x, p.y, sampleR);
    });
    const sMin = Math.min(...streamI);
    const sMax = Math.max(...streamI);
    let selectedStream: string | null = null;
    if (sMax - sMin > 10) {
        const sIdx = streamI.indexOf(sMin);
        selectedStream = STREAMS[sIdx];
    }

    // 2. Read Choices
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
        if (rMax - rMin > 10 && priorityIdx >= 0 && priorityIdx < 10) {
            choices[priorityIdx] = DISTRICTS[r];
        }
    }

    return { selectedStream, choices, toPixel, markerTL, markerTR, markerBL, markerBR };
}

// ============================================================
// Hybrid QR Decoder (Native + jsQR Fallback)
// ============================================================
declare global {
    class BarcodeDetector {
        constructor(options?: { formats: string[] });
        detect(image: ImageBitmapSource | ImageData): Promise<any[]>;
    }
}

export interface QRResult {
    data: string;
    location?: {
        topLeftCorner: { x: number; y: number };
        topRightCorner: { x: number; y: number };
        bottomRightCorner: { x: number; y: number };
        bottomLeftCorner: { x: number; y: number };
    };
    format?: string;
}

/**
 * Hybrid QR Decoder
 * 1. Tries native hardware BarcodeDetector API (much better for faint prints on mobile)
 * 2. Falls back to normal jsQR
 * 3. Falls back to contrast-enhanced jsQR
 */
export async function decodeQRHybrid(imageData: ImageData, skipAdvancedMath: boolean = false): Promise<QRResult | null> {
    // 1. Try native hardware BarcodeDetector API (Chromium only)
    if ('BarcodeDetector' in window) {
        try {
            const detector = new (window as any).BarcodeDetector();
            const results = await detector.detect(imageData);
            if (results && results.length > 0) {
                const res = results[0];
                let location;
                // BarcodeDetector returns cornerPoints
                if (res.cornerPoints && res.cornerPoints.length === 4) {
                    location = {
                        topLeftCorner: res.cornerPoints[0],
                        topRightCorner: res.cornerPoints[1],
                        bottomRightCorner: res.cornerPoints[2],
                        bottomLeftCorner: res.cornerPoints[3]
                    };
                }
                return { data: res.rawValue, location, format: res.format };
            }
        } catch (err) {
            console.error('BarcodeDetector failed:', err);
        }
    }

    // 2. Try ZXing WASM fallback (Lightning fast compared to jsQR for Safari/iOS)
    try {
        const results = await readBarcodesFromImageData(imageData, { maxNumberOfSymbols: 1 });
        if (results && results.length > 0) {
            const pos = results[0].position;
            return {
                data: results[0].text,
                location: {
                    topLeftCorner: pos.topLeft,
                    topRightCorner: pos.topRight,
                    bottomRightCorner: pos.bottomRight,
                    bottomLeftCorner: pos.bottomLeft
                },
                format: results[0].format
            };
        }
    } catch(err) {
        // ZXing failed 
    }

    // 3. Mathematical Morphology (Grayscale -> Local Contrast/CLAHE-lite -> Blur -> Adaptive Threshold -> Morphological Closing)
    // This rescues extremely faint, washed out, or noisy printed QR codes
    if (!skipAdvancedMath) {
        const advanced = new Uint8ClampedArray(imageData.data);
        const w = imageData.width;
        const h = imageData.height;
    
    // Step A: Grayscale
    for (let i = 0; i < advanced.length; i += 4) {
        const luma = advanced[i] * 0.299 + advanced[i + 1] * 0.587 + advanced[i + 2] * 0.114;
        advanced[i] = advanced[i + 1] = advanced[i + 2] = luma;
    }

    // Step B: Adaptive Thresholding (fast integral approx)
    const thresholded = new Uint8ClampedArray(advanced.length);
    const windowSize = 15;
    const C = 10; // constant to subtract from mean

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            let count = 0;
            // Native neighborhood scan (slow but works for small QR crops)
            for (let wy = Math.max(0, y - windowSize); wy < Math.min(h, y + windowSize); wy++) {
                for (let wx = Math.max(0, x - windowSize); wx < Math.min(w, x + windowSize); wx++) {
                    sum += advanced[(wy * w + wx) * 4];
                    count++;
                }
            }
            const mean = sum / count;
            const pxIdx = (y * w + x) * 4;
            const pixel = advanced[pxIdx];
            
            // If pixel is darker than local mean by C -> turn it BLACK, else WHITE
            const newVal = pixel < (mean - C) ? 0 : 255;
            thresholded[pxIdx] = thresholded[pxIdx + 1] = thresholded[pxIdx + 2] = newVal;
            thresholded[pxIdx + 3] = 255;
        }
    }

    // Step C: Morphological Closing (Dilation followed by Erosion to fill gaps in QR dots)
    // We do a simple Dilation (make dark things thicker) to connect faint broken QR blocks
    const closed = new Uint8ClampedArray(thresholded);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            // If the pixel is white, but has a black neighbor, turn it black (Dilation of the black QR blocks)
            if (thresholded[idx] === 255) {
                if (
                    thresholded[((y) * w + (x-1)) * 4] === 0 || // left
                    thresholded[((y) * w + (x+1)) * 4] === 0 || // right
                    thresholded[((y-1) * w + (x)) * 4] === 0 || // top
                    thresholded[((y+1) * w + (x)) * 4] === 0    // bottom
                ) {
                    closed[idx] = closed[idx+1] = closed[idx+2] = 0;
                }
            }
        }
    }

        const advancedData = new ImageData(closed, w, h);
        try {
            const results = await readBarcodesFromImageData(advancedData, { maxNumberOfSymbols: 1 });
            if (results && results.length > 0) {
                const pos = results[0].position;
                return {
                    data: results[0].text,
                    location: {
                        topLeftCorner: pos.topLeft,
                        topRightCorner: pos.topRight,
                        bottomRightCorner: pos.bottomRight,
                        bottomLeftCorner: pos.bottomLeft
                    },
                    format: results[0].format
                };
            }
        } catch(err) {}
    }

    return null;
}
