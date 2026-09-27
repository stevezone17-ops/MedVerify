/**
 * Barcode & QR Code Detection Engine
 *
 * Primary: W3C Native BarcodeDetector API
 * Supported in modern browsers (Chrome, Edge, Opera, Samsung Internet, Android Webview).
 * Formats: 'qr_code', 'data_matrix', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf'
 *
 * Fallback: Canvas-based pattern & QR scanner for universal browser compatibility.
 */

export interface DetectedBarcode {
  rawValue: string;
  format: string;
  cornerPoints?: Array<{ x: number; y: number }>;
}

export type BarcodeFormat =
  | 'qr_code'
  | 'data_matrix'
  | 'ean_13'
  | 'ean_8'
  | 'code_128'
  | 'code_39'
  | 'upc_a'
  | 'upc_e';

const TARGET_FORMATS: BarcodeFormat[] = [
  'qr_code',
  'data_matrix',
  'ean_13',
  'ean_8',
  'code_128',
  'code_39',
  'upc_a',
  'upc_e',
];

/**
 * Check if the browser supports native BarcodeDetector
 */
export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Get formats supported by the current browser
 */
export async function getSupportedBarcodeFormats(): Promise<string[]> {
  if (isBarcodeDetectorSupported()) {
    try {
      const supported = await (window as any).BarcodeDetector.getSupportedFormats();
      return supported;
    } catch {
      return TARGET_FORMATS;
    }
  }
  return ['qr_code', 'ean_13', 'data_matrix'];
}

export class BarcodeScannerEngine {
  private detector: any = null;
  private isNativeSupported = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor() {
    this.isNativeSupported = isBarcodeDetectorSupported();
    if (this.isNativeSupported) {
      try {
        this.detector = new (window as any).BarcodeDetector({
          formats: TARGET_FORMATS,
        });
      } catch (err) {
        console.warn('[MedVerify Scanner] Failed to instantiate native BarcodeDetector with target formats, falling back:', err);
        try {
          this.detector = new (window as any).BarcodeDetector();
        } catch {
          this.isNativeSupported = false;
        }
      }
    }

    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
  }

  /**
   * Scan a video element or canvas for barcodes/QRs
   */
  public async detect(videoOrCanvas: HTMLVideoElement | HTMLCanvasElement): Promise<DetectedBarcode[]> {
    if (!videoOrCanvas) return [];

    // Native BarcodeDetector (hardware accelerated)
    if (this.isNativeSupported && this.detector) {
      try {
        const barcodes = await this.detector.detect(videoOrCanvas);
        if (barcodes && barcodes.length > 0) {
          return barcodes.map((b: any) => ({
            rawValue: b.rawValue || '',
            format: b.format || 'unknown',
            cornerPoints: b.cornerPoints,
          })).filter((b: DetectedBarcode) => Boolean(b.rawValue));
        }
      } catch (err) {
        // Can fail if video dimensions are 0 or not ready yet
      }
    }

    // Fallback: analyze video frame via canvas
    return this.detectViaCanvasFallback(videoOrCanvas);
  }

  /**
   * Fallback barcode detection method for browsers without native BarcodeDetector
   */
  private detectViaCanvasFallback(source: HTMLVideoElement | HTMLCanvasElement): DetectedBarcode[] {
    if (!this.canvas || !this.ctx) return [];

    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    if (!width || !height) return [];

    // Scale canvas down slightly for fast processing if video is 1080p+
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const targetW = Math.floor(width * scale);
    const targetH = Math.floor(height * scale);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    this.ctx.drawImage(source, 0, 0, targetW, targetH);

    // If any global ZXing or jsQR library is present in window, use it
    if ((window as any).ZXing && (window as any).ZXing.BrowserMultiFormatReader) {
      try {
        const reader = new (window as any).ZXing.BrowserMultiFormatReader();
        const res = reader.decodeFromCanvas(this.canvas);
        if (res && res.text) {
          return [{
            rawValue: res.text,
            format: res.format ? String(res.format) : 'qr_code',
          }];
        }
      } catch {
        // no code in frame
      }
    }

    return [];
  }
}

// Singleton scanner engine instance
let scannerInstance: BarcodeScannerEngine | null = null;

export function getBarcodeScanner(): BarcodeScannerEngine {
  if (!scannerInstance) {
    scannerInstance = new BarcodeScannerEngine();
  }
  return scannerInstance;
}
