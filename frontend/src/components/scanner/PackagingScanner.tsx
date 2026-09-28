import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  CameraOff,
  RefreshCw,
  Image as ImageIcon,
  Search,
  AlertTriangle,
  Edit3,
  ShieldCheck,
  Loader2,
  Check,
  X,
} from 'lucide-react';

interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence: number;
}

interface PackagingScannerProps {
  onVerify: (params: {
    identifier: string;
    product_name?: string;
    manufacturer?: string;
    batch_number?: string;
    serial_number?: string;
    expiry_date?: string;
  }) => void;
  isVerifying: boolean;
}

type PackagingStep = 'CAPTURE' | 'PREVIEW' | 'PROCESSING' | 'REVIEW';

export const PackagingScanner: React.FC<PackagingScannerProps> = ({ onVerify, isVerifying }) => {
  const [step, setStep] = useState<PackagingStep>('CAPTURE');
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* ignore */ }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setOcrError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      setStep('CAPTURE');
    } catch (err: any) {
      setOcrError(err.name === 'NotAllowedError'
        ? 'Camera access denied. Please allow camera permissions.'
        : 'Could not start camera: ' + (err.message || 'Unknown error'));
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
    setStep('PREVIEW');
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    setExtractedFields([]);
    setEditValues({});
    setOcrError(null);
    startCamera();
  }, [startCamera]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
      stopCamera();
      setStep('PREVIEW');
    };
    reader.readAsDataURL(file);
  }, [stopCamera]);

  const runOCR = useCallback(async () => {
    if (!capturedImage) return;
    setStep('PROCESSING');
    setOcrError(null);

    try {
      const Tesseract = await import('tesseract.js');
      const { data } = await Tesseract.recognize(capturedImage, 'eng', {
        logger: (m: any) => {
          // Progress callback for the UI
          if (m.status === 'recognizing text') {
            // Could update a progress bar here
          }
        },
      });

      const text = data.text || '';
      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const fields = parseOCRText(lines, text);

      setExtractedFields(fields);
      const vals: Record<string, string> = {};
      fields.forEach((f) => { vals[f.key] = f.value; });
      setEditValues(vals);
      setStep('REVIEW');
    } catch (err: any) {
      console.error('[MedVerify OCR] Error:', err);
      setOcrError('OCR processing failed: ' + (err.message || 'Unknown error'));
      setStep('PREVIEW');
    }
  }, [capturedImage]);

  const handleFieldChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleVerify = () => {
    onVerify({
      identifier: editValues.gtin || editValues.product_name || 'PACKAGING_OCR_INPUT',
      product_name: editValues.product_name || undefined,
      manufacturer: editValues.manufacturer || undefined,
      batch_number: editValues.batch_number || undefined,
      serial_number: editValues.serial_number || undefined,
      expiry_date: editValues.expiry_date || undefined,
    });
  };

  return (
    <div className="packaging-scanner-module">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <AnimatePresence mode="wait">
        {/* Step 1: CAPTURE */}
        {step === 'CAPTURE' && (
          <motion.div
            key="capture"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="packaging-step"
          >
            <div className="packaging-viewport">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`packaging-video ${cameraActive ? 'is-visible' : 'is-hidden'}`}
              />

              {!cameraActive && (
                <div className="packaging-start-prompt">
                  <Camera size={42} strokeWidth={1.2} className="packaging-icon" />
                  <h3>Photograph Medicine Packaging</h3>
                  <p>Take a clear photo of the medicine label, box, or blister pack.</p>
                  <div className="packaging-start-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      onClick={startCamera}
                    >
                      <Camera size={18} />
                      <span>Open Camera</span>
                    </button>
                    <label className="btn btn-secondary btn-lg packaging-upload-label">
                      <ImageIcon size={18} />
                      <span>Upload Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {cameraActive && (
                <div className="packaging-capture-overlay">
                  <div className="packaging-guide-frame">
                    <span className="pkg-bracket pkg-bracket--tl" />
                    <span className="pkg-bracket pkg-bracket--tr" />
                    <span className="pkg-bracket pkg-bracket--bl" />
                    <span className="pkg-bracket pkg-bracket--br" />
                  </div>
                  <div className="packaging-capture-hud">
                    <span className="packaging-hud-text">Align medicine label within the frame</span>
                  </div>
                </div>
              )}
            </div>

            {cameraActive && (
              <div className="packaging-controls">
                <button type="button" className="btn btn-ghost btn-sm" onClick={stopCamera}>
                  <CameraOff size={14} />
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-lg packaging-shutter-btn"
                  onClick={capturePhoto}
                  aria-label="Take Photo"
                >
                  <div className="shutter-ring" />
                </button>
                <label className="btn btn-ghost btn-sm packaging-upload-label">
                  <ImageIcon size={14} />
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            )}

            {ocrError && (
              <div className="packaging-error-banner">
                <AlertTriangle size={16} />
                <span>{ocrError}</span>
              </div>
            )}
          </motion.div>
        )}

        {/* Step 2: PREVIEW */}
        {step === 'PREVIEW' && capturedImage && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="packaging-step"
          >
            <div className="packaging-preview-container">
              <img src={capturedImage} alt="Captured medicine packaging" className="packaging-preview-img" />
            </div>
            <div className="packaging-preview-actions">
              <button type="button" className="btn btn-secondary" onClick={retakePhoto}>
                <RefreshCw size={15} />
                <span>Retake Photo</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={runOCR}>
                <Search size={15} />
                <span>Extract Information</span>
              </button>
            </div>
            {ocrError && (
              <div className="packaging-error-banner">
                <AlertTriangle size={16} />
                <span>{ocrError}</span>
              </div>
            )}
          </motion.div>
        )}

        {/* Step 3: PROCESSING */}
        {step === 'PROCESSING' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="packaging-step packaging-processing"
          >
            <Loader2 size={40} className="packaging-spinner" />
            <h3>Extracting Packaging Information</h3>
            <p>Running optical character recognition on the captured image...</p>
            <p className="packaging-processing-note">
              <em>This extracts text from the image. It does not verify medicine authenticity.</em>
            </p>
          </motion.div>
        )}

        {/* Step 4: REVIEW */}
        {step === 'REVIEW' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="packaging-step"
          >
            <div className="packaging-review-header">
              <div className="packaging-review-badge">
                <Edit3 size={14} />
                <span>Detected from packaging</span>
              </div>
              <p className="packaging-review-note">
                Please review and correct any errors before verifying against the registry.
              </p>
            </div>

            {capturedImage && (
              <div className="packaging-review-thumbnail">
                <img src={capturedImage} alt="Captured packaging" />
              </div>
            )}

            <div className="packaging-review-fields">
              {REVIEW_FIELDS.map((field) => (
                <div key={field.key} className="packaging-field-group">
                  <label htmlFor={`ocr-${field.key}`} className="packaging-field-label">
                    <span>{field.label}</span>
                    <span className={`packaging-field-tag packaging-field-tag--${field.importance}`}>
                      {field.importance}
                    </span>
                  </label>
                  <input
                    id={`ocr-${field.key}`}
                    type="text"
                    className="packaging-field-input font-mono"
                    value={editValues[field.key] || ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>

            <div className="packaging-review-actions">
              <button type="button" className="btn btn-secondary" onClick={retakePhoto}>
                <RefreshCw size={15} />
                <span>Retake</span>
              </button>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleVerify}
                disabled={isVerifying || !Object.values(editValues).some((v) => v.trim())}
              >
                <ShieldCheck size={18} />
                <span>{isVerifying ? 'Verifying...' : 'Verify Medicine'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Review field definitions
const REVIEW_FIELDS = [
  { key: 'product_name', label: 'Medicine Name', importance: 'recommended', placeholder: 'e.g. Amoxicillin 500 mg Capsules' },
  { key: 'manufacturer', label: 'Manufacturer', importance: 'recommended', placeholder: 'e.g. PharmaCore Laboratories' },
  { key: 'gtin', label: 'GTIN / Barcode', importance: 'recommended', placeholder: 'e.g. 89012345678901' },
  { key: 'batch_number', label: 'Batch / Lot Number', importance: 'important', placeholder: 'e.g. BATCH-2026-001' },
  { key: 'expiry_date', label: 'Expiry Date', importance: 'important', placeholder: 'e.g. 2028-01-09 or 01/2028' },
  { key: 'serial_number', label: 'Serial Number', importance: 'optional', placeholder: 'e.g. SER-PC-000001' },
];

/**
 * Parse raw OCR text lines and attempt to extract pharmaceutical fields.
 * This is a best-effort heuristic — OCR output is inherently noisy.
 */
function parseOCRText(lines: string[], fullText: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const textLower = fullText.toLowerCase();

  // GTIN / barcode pattern: 8-14 digit sequences
  const gtinMatch = fullText.match(/\b(\d{8,14})\b/);
  if (gtinMatch) {
    fields.push({ key: 'gtin', label: 'GTIN / Barcode', value: gtinMatch[1], confidence: 70 });
  }

  // Batch / Lot number patterns
  const batchPatterns = [
    /(?:batch|lot|b\.?\s*no|lot\s*no)[:\s#]*([A-Z0-9][A-Z0-9\-_.]{2,20})/i,
    /\b(BATCH[\-_][A-Z0-9\-]{3,20})\b/i,
    /\b(LOT[\-_][A-Z0-9\-]{3,20})\b/i,
  ];
  for (const pat of batchPatterns) {
    const m = fullText.match(pat);
    if (m) {
      fields.push({ key: 'batch_number', label: 'Batch Number', value: m[1].trim(), confidence: 65 });
      break;
    }
  }

  // Expiry date patterns
  const expiryPatterns = [
    /(?:exp(?:iry)?\.?|best\s*before|use\s*before|bb)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:exp(?:iry)?\.?|bb)[:\s]*(\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{4}[\-\/]\d{2}[\-\/]\d{2})/,
  ];
  for (const pat of expiryPatterns) {
    const m = fullText.match(pat);
    if (m) {
      fields.push({ key: 'expiry_date', label: 'Expiry Date', value: m[1].trim(), confidence: 60 });
      break;
    }
  }

  // Manufacturer / company name (heuristic: look for "mfg", "manufactured by", company suffixes)
  const mfrPatterns = [
    /(?:mfg\.?|manufactured\s*by|mfr\.?)[:\s]*(.{5,50})/i,
    /(?:marketed\s*by|distributed\s*by)[:\s]*(.{5,50})/i,
  ];
  for (const pat of mfrPatterns) {
    const m = fullText.match(pat);
    if (m) {
      const val = m[1].split('\n')[0].trim();
      if (val.length > 2) {
        fields.push({ key: 'manufacturer', label: 'Manufacturer', value: val, confidence: 55 });
        break;
      }
    }
  }

  // Serial number
  const serialPatterns = [
    /(?:s\.?\s*n\.?|serial(?:\s*no\.?)?)[:\s#]*([A-Z0-9][A-Z0-9\-]{3,25})/i,
    /\b(SER[\-_][A-Z0-9\-]{3,20})\b/i,
  ];
  for (const pat of serialPatterns) {
    const m = fullText.match(pat);
    if (m) {
      fields.push({ key: 'serial_number', label: 'Serial Number', value: m[1].trim(), confidence: 60 });
      break;
    }
  }

  // Product name: typically the first prominent line or look for known drug name patterns
  // This is heuristic — look for lines that contain "mg", "ml", "capsule", "tablet", etc.
  const drugNamePatterns = /\b(\w+(?:\s+\w+){0,4}\s*\d+\s*(?:mg|ml|mcg|g|iu)\b.*)/i;
  const drugMatch = fullText.match(drugNamePatterns);
  if (drugMatch) {
    const nameCandidate = drugMatch[1].split('\n')[0].trim();
    if (nameCandidate.length > 3) {
      fields.push({ key: 'product_name', label: 'Medicine Name', value: nameCandidate, confidence: 50 });
    }
  }

  return fields;
}

export default PackagingScanner;
