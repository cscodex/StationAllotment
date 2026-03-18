import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// Configure Cloudinary from environment variables
// Set CLOUDINARY_URL in .env (format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME)
// OR set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET individually
if (process.env.CLOUDINARY_URL) {
  // CLOUDINARY_URL is auto-parsed by the SDK
} else if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Check if Cloudinary is configured and available
 */
export function isCloudinaryConfigured(): boolean {
  const config = cloudinary.config();
  return !!(config.cloud_name && config.api_key && config.api_secret);
}

/**
 * Upload a file to Cloudinary and return the secure URL.
 * Falls back to local storage if Cloudinary is not configured.
 */
export async function uploadToCloudinary(
  filePath: string,
  options: {
    folder?: string;
    publicId?: string;
    resourceType?: 'image' | 'raw' | 'video' | 'auto';
  } = {},
): Promise<{ url: string; publicId: string; isCloudinary: boolean }> {
  if (!isCloudinaryConfigured()) {
    // Fallback: return local path (existing behavior)
    const filename = filePath.split('/').pop() || 'unknown';
    console.warn('[Cloudinary] Not configured — using local storage fallback for:', filename);
    return {
      url: `/uploads/${filename}`,
      publicId: filename,
      isCloudinary: false,
    };
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: options.folder || 'station-allotment/omr-scans',
      public_id: options.publicId,
      resource_type: options.resourceType || 'image',
      overwrite: true,
      quality: 'auto:good',
      format: 'jpg',
    });

    // Delete the local temp file after successful upload
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Non-fatal — temp file cleanup failed
    }

    console.log(`[Cloudinary] Uploaded: ${result.secure_url} (${Math.round(result.bytes / 1024)} KB)`);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      isCloudinary: true,
    };
  } catch (error) {
    console.error('[Cloudinary] Upload failed, falling back to local storage:', error);
    const filename = filePath.split('/').pop() || 'unknown';
    return {
      url: `/uploads/${filename}`,
      publicId: filename,
      isCloudinary: false,
    };
  }
}

/**
 * Delete an image from Cloudinary by its public ID.
 */
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  if (!isCloudinaryConfigured()) return false;
  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (error) {
    console.error('[Cloudinary] Delete failed:', error);
    return false;
  }
}
