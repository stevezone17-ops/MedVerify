/**
 * Image Quality and Validation Utility for MedVerify
 *
 * Provides:
 * - MIME type validation (JPEG, PNG, WEBP)
 * - File size constraints (max 10MB per file)
 * - Dimension verification (minimum 200x200px)
 * - Client-side blurriness detection using canvas Laplacian edge variance
 */

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  width?: number;
  height?: number;
  fileSize: number;
  mimeType: string;
  blurScore?: number;
  isBlurry?: boolean;
}

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MIN_DIMENSION_PX = 200; // Minimum width & height
export const BLUR_THRESHOLD = 35.0; // Laplacian variance below this is flagged as blurry

/**
 * Validates file headers, dimensions, and visual clarity of an uploaded medicine packaging photo.
 */
export async function validatePackagingImage(file: File): Promise<ImageValidationResult> {
  const mimeType = file.type.toLowerCase();
  const fileSize = file.size;

  // 1. MIME Type check
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      isValid: false,
      error: `Unsupported format (${file.type || 'unknown'}). Please upload a JPG, PNG, or WEBP image.`,
      fileSize,
      mimeType,
    };
  }

  // 2. File size check
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (fileSize / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed size is 10 MB per image.`,
      fileSize,
      mimeType,
    };
  }

  if (fileSize < 2048) {
    return {
      isValid: false,
      error: 'File is too small or corrupted (less than 2 KB).',
      fileSize,
      mimeType,
    };
  }

  // 3. Load image to inspect dimensions and visual clarity
  return new Promise<ImageValidationResult>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;

      // Dimension check
      if (width < MIN_DIMENSION_PX || height < MIN_DIMENSION_PX) {
        resolve({
          isValid: false,
          error: `Image dimensions are too small (${width}×${height}px). Minimum required is ${MIN_DIMENSION_PX}×${MIN_DIMENSION_PX}px for legible text.`,
          width,
          height,
          fileSize,
          mimeType,
        });
        return;
      }

      // 4. Blur detection using offscreen canvas Laplacian variance
      try {
        const blurScore = calculateBlurScore(img);
        const isBlurry = blurScore < BLUR_THRESHOLD;

        let warning: string | undefined = undefined;
        if (isBlurry) {
          warning = `Image appears soft or out of focus (sharpness score: ${Math.round(blurScore)}). For optimal OCR reading, ensure text and barcodes are sharp and well-lit.`;
        }

        resolve({
          isValid: true,
          warning,
          width,
          height,
          fileSize,
          mimeType,
          blurScore,
          isBlurry,
        });
      } catch (e) {
        // If blur computation fails, still allow image
        resolve({
          isValid: true,
          width,
          height,
          fileSize,
          mimeType,
        });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        isValid: false,
        error: 'Could not decode image data. The file may be corrupted or not a valid image.',
        fileSize,
        mimeType,
      });
    };

    img.src = objectUrl;
  });
}

/**
 * Calculates a sharpness metric by downsampling the image to a standardized 128x128
 * canvas and computing the variance of the discrete 3x3 Laplacian operator.
 */
function calculateBlurScore(img: HTMLImageElement): number {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 100.0;

  // Draw image scaled to 128x128
  ctx.drawImage(img, 0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  // Convert to grayscale luminance array
  const gray = new Float32Array(size * size);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 3x3 Laplacian kernel
  //  0  1  0
  //  1 -4  1
  //  0  1  0
  const laplacian = new Float32Array((size - 2) * (size - 2));
  let sum = 0;
  let count = 0;

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      const val =
        gray[idx - size] +
        gray[idx + size] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];

      laplacian[count] = val;
      sum += val;
      count++;
    }
  }

  if (count === 0) return 100.0;

  const mean = sum / count;
  let varianceSum = 0;
  for (let i = 0; i < count; i++) {
    const diff = laplacian[i] - mean;
    varianceSum += diff * diff;
  }

  return varianceSum / count;
}

/**
 * Format bytes into human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

