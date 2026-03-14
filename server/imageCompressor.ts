import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// A4 at 300 DPI dimensions
const A4_WIDTH = 2480;
const A4_HEIGHT = 3508;

// Default maximum file size: 2 MB
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export interface CompressResult {
  path: string;
  sizeKB: number;
  quality: number;
  width: number;
  height: number;
}

/**
 * Compress an image to fit within A4 dimensions (2480×3508) while keeping
 * the aspect ratio intact (no cropping, no distortion). The file is iteratively
 * re-encoded at decreasing JPEG quality until it falls below `maxBytes`.
 *
 * The original file is replaced with the compressed version.
 */
export async function compressToA4(
  inputPath: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<CompressResult> {
  const outputPath = inputPath + '.compressed.jpg';

  // Step 1: Resize to fit inside A4 bounds (no upscale, no crop)
  let quality = 85;
  const minQuality = 40;

  let pipeline = sharp(inputPath)
    .resize({
      width: A4_WIDTH,
      height: A4_HEIGHT,
      fit: 'inside',            // maintains aspect ratio
      withoutEnlargement: true, // never upscale small images
    })
    .jpeg({ quality, mozjpeg: true });

  await pipeline.toFile(outputPath);

  // Step 2: Check file size, iteratively lower quality if needed
  let stat = await fs.stat(outputPath);

  while (stat.size > maxBytes && quality > minQuality) {
    quality -= 5;
    await sharp(inputPath)
      .resize({
        width: A4_WIDTH,
        height: A4_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toFile(outputPath + '.tmp');

    // Swap
    await fs.rename(outputPath + '.tmp', outputPath);
    stat = await fs.stat(outputPath);
  }

  // Step 3: Get final metadata
  const metadata = await sharp(outputPath).metadata();

  // Step 4: Replace original file with the compressed version
  await fs.rename(outputPath, inputPath);

  return {
    path: inputPath,
    sizeKB: Math.round(stat.size / 1024),
    quality,
    width: metadata.width || 0,
    height: metadata.height || 0,
  };
}
