/**
 * Barcode, QR Code & DataMatrix Detection Engine
 *
 * Primary: High-performance ZXing MultiFormatReader with ROI scanning
 * Acceleration fallback: W3C Native BarcodeDetector API (where supported)
 *
 * Supported formats:
 * - QR_CODE
 * - DATA_MATRIX
 * - EAN_13
 * - EAN_8
 * - CODE_128
 * - CODE_39
 * - UPC_A
 * - UPC_E
 */

export interface DetectedBarcode {
  rawValue: string;
  format: string;
  cornerPoints?: Array<{ x: number; y: number }>;
}

export type BarcodeFormatName =
  | 'QR_CODE'
  | 'DATA_MATRIX'
  | 'EAN_13'
  | 'EAN_8'
  | 'CODE_128'
  | 'CODE_39'
  | 'UPC_A'
  | 'UPC_E'
  | 'UNKNOWN';

export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Ensure ZXing library is loaded and available on window.ZXing
 */
export async function ensureZXingLoaded(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).ZXing) return (window as any).ZXing;

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src*="zxing.min.js"]');
    if (existing) {
      if ((window as any).ZXing) {
        resolve((window as any).ZXing);
        return;
      }
      existing.addEventListener('load', () => resolve((window as any).ZXing));
      setTimeout(() => resolve((window as any).ZXing || null), 1500);
      return;
    }

    const script = document.createElement('script');
    script.src = '/vendor/zxing.min.js';
    script.async = true;
    script.onload = () => resolve((window as any).ZXing);
    script.onerror = () => {
      console.warn('[MedVerify Scanner] Failed to load /vendor/zxing.min.js');
      resolve(null);
    };
    document.head.appendChild(script);
  });
}

export class BarcodeScannerEngine {
  private nativeDetector: any = null;
  private isNativeSupported = false;
  private multiFormatReader: any = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private captureCtx: CanvasRenderingContext2D | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Setup off-screen capture canvas
    if (typeof document !== 'undefined') {
      this.captureCanvas = document.createElement('canvas');
      this.captureCtx = this.captureCanvas.getContext('2d', { willReadFrequently: true });
    }

    // 2. Try native BarcodeDetector if available
    this.isNativeSupported = isBarcodeDetectorSupported();
    if (this.isNativeSupported) {
      try {
        const supported = await (window as any).BarcodeDetector.getSupportedFormats().catch(() => []);
        this.nativeDetector = new (window as any).BarcodeDetector({
          formats: supported.length > 0 ? supported : [
            'qr_code', 'data_matrix', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'
          ]
        });
      } catch (err) {
        try {
          this.nativeDetector = new (window as any).BarcodeDetector();
        } catch {
          this.isNativeSupported = false;
        }
      }
    }

    // 3. Ensure ZXing is initialized
    await this.initZXing();
  }

  private async initZXing() {
    const ZXing = await ensureZXingLoaded();
    if (!ZXing) return null;

    if (!this.multiFormatReader && ZXing.MultiFormatReader) {
      try {
        const hints = new Map();
        const formats = [
          ZXing.BarcodeFormat.QR_CODE,
          ZXing.BarcodeFormat.DATA_MATRIX,
          ZXing.BarcodeFormat.EAN_13,
          ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.CODE_128,
          ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.UPC_E,
        ];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

        this.multiFormatReader = new ZXing.MultiFormatReader();
        this.multiFormatReader.setHints(hints);
      } catch (e) {
        console.warn('[MedVerify Scanner] Error initializing ZXing hints:', e);
        try {
          this.multiFormatReader = new ZXing.MultiFormatReader();
        } catch (err) {
          console.error('[MedVerify Scanner] Failed to instantiate ZXing reader:', err);
        }
      }
    }
    return this.multiFormatReader;
  }

  /**
   * Helper to decode a region of pixels via ZXing MultiFormatReader
   */
  private decodeImageData(
    imgData: ImageData,
    width: number,
    height: number,
    offsetX = 0,
    offsetY = 0
  ): DetectedBarcode | null {
    if (!this.multiFormatReader) return null;
    const ZXing = (window as any).ZXing;
    if (!ZXing) return null;

    const data = imgData.data;
    const len = width * height;
    const luminances = new Uint8ClampedArray(len);

    for (let i = 0, j = 0; i < len; i++, j += 4) {
      luminances[i] = (data[j] * 306 + data[j + 1] * 601 + data[j + 2] * 117 + 512) >> 10;
    }

    const ls = new ZXing.RGBLuminanceSource(luminances, width, height);
    const bb = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(ls));

    let result = null;
    try {
      result = this.multiFormatReader.decodeWithState(bb);
    } catch {
      // Try inverted luminance (white-on-dark code)
      try {
        const invertedBb = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(ls.invert()));
        result = this.multiFormatReader.decodeWithState(invertedBb);
      } catch {
        return null;
      }
    }

    if (result && typeof result.getText === 'function') {
      const rawValue = result.getText().trim();
      if (!rawValue) return null;

      const formatNum = result.getBarcodeFormat ? result.getBarcodeFormat() : undefined;
      let formatName = 'QR_CODE';
      if (ZXing.BarcodeFormat && formatNum !== undefined && ZXing.BarcodeFormat[formatNum]) {
        formatName = String(ZXing.BarcodeFormat[formatNum]).toUpperCase();
      }

      const points = result.getResultPoints ? result.getResultPoints() : [];
      const cornerPoints = points.map((p: any) => ({
        x: (typeof p.getX === 'function' ? p.getX() : p.x || 0) + offsetX,
        y: (typeof p.getY === 'function' ? p.getY() : p.y || 0) + offsetY,
      }));

      return {
        rawValue,
        format: formatName,
        cornerPoints,
      };
    }

    return null;
  }

  /**
   * Scan a video element or canvas for QR, DataMatrix, and 1D barcodes in real time
   */
  public async detect(videoOrCanvas: HTMLVideoElement | HTMLCanvasElement): Promise<DetectedBarcode[]> {
    if (!videoOrCanvas) return [];

    let width = 0;
    let height = 0;

    if (videoOrCanvas instanceof HTMLVideoElement) {
      if (videoOrCanvas.readyState < 2 || videoOrCanvas.videoWidth === 0 || videoOrCanvas.videoHeight === 0) {
        return [];
      }
      width = videoOrCanvas.videoWidth;
      height = videoOrCanvas.videoHeight;
    } else if (videoOrCanvas instanceof HTMLCanvasElement) {
      width = videoOrCanvas.width;
      height = videoOrCanvas.height;
      if (width === 0 || height === 0) return [];
    }

    if (!this.captureCanvas || !this.captureCtx) {
      if (typeof document !== 'undefined') {
        this.captureCanvas = document.createElement('canvas');
        this.captureCtx = this.captureCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (!this.captureCanvas || !this.captureCtx) return [];
    }

    // Adjust canvas dimensions if needed
    if (this.captureCanvas.width !== width || this.captureCanvas.height !== height) {
      this.captureCanvas.width = width;
      this.captureCanvas.height = height;
    }

    // Paint video frame to off-screen canvas
    this.captureCtx.drawImage(videoOrCanvas, 0, 0, width, height);

    // 1. Try Native BarcodeDetector if available (hardware accelerated)
    if (this.isNativeSupported && this.nativeDetector) {
      try {
        const barcodes = await this.nativeDetector.detect(this.captureCanvas);
        if (barcodes && barcodes.length > 0) {
          const results: DetectedBarcode[] = barcodes
            .filter((b: any) => Boolean(b.rawValue))
            .map((b: any) => {
              const rawFormat = (b.format || 'UNKNOWN').toUpperCase().replace(/-/g, '_');
              return {
                rawValue: b.rawValue.trim(),
                format: rawFormat,
                cornerPoints: b.cornerPoints,
              };
            });
          if (results.length > 0 && results[0].rawValue) {
            return results;
          }
        }
      } catch {
        // Fall through to ZXing multi-pass decoder
      }
    }

    // 2. High-performance ZXing MultiFormatReader
    if (!this.multiFormatReader) {
      await this.initZXing();
    }

    if (!this.multiFormatReader) {
      return [];
    }

    // Pass A: Region of Interest (ROI) - Center 65% of the frame (viewfinder box)
    // Faster and higher resolution for centered medicine barcodes/QR codes
    const roiW = Math.round(width * 0.65);
    const roiH = Math.round(height * 0.65);
    const roiX = Math.round((width - roiW) / 2);
    const roiY = Math.round((height - roiH) / 2);

    try {
      const roiImgData = this.captureCtx.getImageData(roiX, roiY, roiW, roiH);
      const roiResult = this.decodeImageData(roiImgData, roiW, roiH, roiX, roiY);
      if (roiResult) {
        return [roiResult];
      }
    } catch {
      // Continue to full frame
    }

    // Pass B: Full frame scan if ROI didn't detect (e.g. barcode held near edge)
    try {
      const fullImgData = this.captureCtx.getImageData(0, 0, width, height);
      const fullResult = this.decodeImageData(fullImgData, width, height, 0, 0);
      if (fullResult) {
        return [fullResult];
      }
    } catch {
      // No barcode detected in this frame
    }

    return [];
  }

  public reset() {
    if (this.multiFormatReader && typeof this.multiFormatReader.reset === 'function') {
      try {
        this.multiFormatReader.reset();
      } catch {
        // ignored
      }
    }
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
