/**
 * Resize a canvas to fit within A4 proportions while preserving aspect ratio.
 * This is a client-side pre-compression step to reduce upload payload before
 * the server-side sharp pipeline further optimises it.
 *
 * Default target: 1240×1754 (half of 300 DPI A4) — good quality/size balance.
 * The OMR visual grid, QR code, barcode and choices matrix remain pixel-aligned
 * because we scale uniformly (no cropping, no distortion).
 */
export function resizeCanvasToA4(
  sourceCanvas: HTMLCanvasElement,
  maxW: number = 1240,
  maxH: number = 1754,
): HTMLCanvasElement {
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  // If already within bounds, return the original canvas
  if (srcW <= maxW && srcH <= maxH) {
    return sourceCanvas;
  }

  // Calculate uniform scale factor (fit inside, no crop)
  const scale = Math.min(maxW / srcW, maxH / srcH);
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const resized = document.createElement('canvas');
  resized.width = dstW;
  resized.height = dstH;

  const ctx = resized.getContext('2d');
  if (ctx) {
    // Use high-quality bicubic interpolation
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, dstW, dstH);
  }

  return resized;
}
