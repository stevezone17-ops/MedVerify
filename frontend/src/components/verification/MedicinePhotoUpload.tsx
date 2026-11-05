import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  UploadCloud,
  X,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Maximize2,
  Trash2,
  RotateCw,
  Layers,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Lightbulb,
  Focus,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  validatePackagingImage,
  formatFileSize,
  type ImageValidationResult,
  ALLOWED_MIME_TYPES,
} from '../../utils/imageQuality';

export type PhotoSlotType = 'front' | 'back' | 'barcode' | 'blister';

export interface PackagingPhotoItem {
  id: string;
  slot: PhotoSlotType;
  label: string;
  file: File;
  previewUrl: string;
  validation: ImageValidationResult;
  timestamp: number;
}

interface MedicinePhotoUploadProps {
  photos: PackagingPhotoItem[];
  onPhotosChange: (photos: PackagingPhotoItem[]) => void;
  onProceed?: () => void;
  disabled?: boolean;
}

interface SlotDefinition {
  slot: PhotoSlotType;
  slotNumber: number;
  label: string;
  purpose: string;
  required: boolean;
  statusLabel: string;
  tip: string;
}

const PRIMARY_SLOTS: SlotDefinition[] = [
  {
    slot: 'front',
    slotNumber: 1,
    label: 'Front Packaging',
    purpose: 'Medicine name, brand, strength, and dosage form',
    required: true,
    statusLabel: 'Required',
    tip: 'Ensure active ingredient and brand name are clearly legible.',
  },
  {
    slot: 'back',
    slotNumber: 2,
    label: 'Back / Side Label',
    purpose: 'Batch/lot number, expiry date, manufacturing date, and manufacturer info',
    required: true,
    statusLabel: 'Required',
    tip: 'Make sure expiry date and batch code numbers are in sharp focus.',
  },
  {
    slot: 'barcode',
    slotNumber: 3,
    label: 'Barcode / DataMatrix',
    purpose: 'GS1 2D DataMatrix code or linear packaging barcode',
    required: false,
    statusLabel: 'Recommended',
    tip: 'Capture the square 2D DataMatrix or 1D barcode with zero flash glare.',
  },
];

export const MedicinePhotoUpload: React.FC<MedicinePhotoUploadProps> = ({
  photos,
  onPhotosChange,
  onProceed,
  disabled = false,
}) => {
  const [activeSlotTarget, setActiveSlotTarget] = useState<PhotoSlotType | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [draggingSlot, setDraggingSlot] = useState<PhotoSlotType | null>(null);

  // Snapshot retake state inside camera modal
  const [capturedBlob, setCapturedBlob] = useState<{ blob: Blob; url: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setCameraError(null);
    if (capturedBlob) {
      URL.revokeObjectURL(capturedBlob.url);
      setCapturedBlob(null);
    }
  }, [capturedBlob]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // ignore
          }
        });
      }
    };
  }, []);

  // Start device camera for a specific slot
  const startCamera = useCallback(
    async (targetSlot: PhotoSlotType) => {
      setActiveSlotTarget(targetSlot);
      setCameraError(null);
      setCapturedBlob(null);
      setIsCameraOpen(true);

      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.error('[MedVerify Photo] Camera access error:', err);
        setCameraError(
          err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
            ? 'Camera permission denied. Please allow camera access in your browser settings, or upload a photo using Choose Photo.'
            : `Could not start camera (${err.message || 'Device camera unavailable'}). You can upload a saved image instead.`
        );
      }
    },
    [facingMode]
  );

  // Flip camera (front / back)
  const toggleFacingMode = useCallback(() => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (activeSlotTarget) {
      stopCamera();
      setTimeout(() => {
        startCamera(activeSlotTarget);
      }, 150);
    }
  }, [facingMode, activeSlotTarget, stopCamera, startCamera]);

  // Capture video frame snapshot
  const takeSnapshot = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !activeSlotTarget) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setCapturedBlob({ blob, url });
      },
      'image/jpeg',
      0.92
    );
  }, [activeSlotTarget]);

  // Accept captured photo from camera
  const commitCapturedPhoto = useCallback(async () => {
    if (!capturedBlob || !activeSlotTarget) return;

    const timestamp = Date.now();
    const file = new File(
      [capturedBlob.blob],
      `medverify_${activeSlotTarget}_${timestamp}.jpg`,
      { type: 'image/jpeg' }
    );

    setIsProcessingFile(true);
    const validation = await validatePackagingImage(file);
    setIsProcessingFile(false);

    const slotDef = PRIMARY_SLOTS.find((s) => s.slot === activeSlotTarget);
    const label = slotDef ? slotDef.label : 'Packaging Photo';

    const newItem: PackagingPhotoItem = {
      id: `photo_${timestamp}_${Math.random().toString(36).slice(2, 7)}`,
      slot: activeSlotTarget,
      label,
      file,
      previewUrl: capturedBlob.url,
      validation,
      timestamp,
    };

    const updated = photos.filter((p) => p.slot !== activeSlotTarget);
    onPhotosChange([...updated, newItem]);

    setCapturedBlob(null);
    stopCamera();
  }, [capturedBlob, activeSlotTarget, photos, onPhotosChange, stopCamera]);

  // Process a selected or dropped file for a given slot
  const processFileForSlot = useCallback(
    async (file: File, slot: PhotoSlotType) => {
      setIsProcessingFile(true);
      const validation = await validatePackagingImage(file);
      setIsProcessingFile(false);

      const slotDef = PRIMARY_SLOTS.find((s) => s.slot === slot);
      const label = slotDef ? slotDef.label : 'Packaging Photo';
      const timestamp = Date.now();

      const newItem: PackagingPhotoItem = {
        id: `photo_${timestamp}_${Math.random().toString(36).slice(2, 7)}`,
        slot,
        label,
        file,
        previewUrl: URL.createObjectURL(file),
        validation,
        timestamp,
      };

      const updated = photos.filter((p) => p.slot !== slot);
      onPhotosChange([...updated, newItem]);
    },
    [photos, onPhotosChange]
  );

  // Handle local file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeSlotTarget) return;
    const file = files[0];
    processFileForSlot(file, activeSlotTarget);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Open native file dialog for a specific slot
  const triggerFileDialog = (slot: PhotoSlotType) => {
    setActiveSlotTarget(slot);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent, slot: PhotoSlotType) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggingSlot !== slot) {
      setDraggingSlot(slot);
    }
  };

  const handleDragLeave = (e: React.DragEvent, slot: PhotoSlotType) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggingSlot === slot) {
      setDraggingSlot(null);
    }
  };

  const handleDrop = (e: React.DragEvent, slot: PhotoSlotType) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingSlot(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFileForSlot(files[0], slot);
    }
  };

  // Remove photo from slot
  const removePhoto = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = photos.find((p) => p.id === id);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
    }
    onPhotosChange(photos.filter((p) => p.id !== id));
  };

  // Check required completion: Front and Back must be uploaded with valid images
  const hasFront = photos.some((p) => p.slot === 'front' && p.validation.isValid);
  const hasBack = photos.some((p) => p.slot === 'back' && p.validation.isValid);
  const hasBarcode = photos.some((p) => p.slot === 'barcode' && p.validation.isValid);
  const totalUploaded = photos.filter((p) => p.validation.isValid).length;
  const isReadyToProceed = hasFront && hasBack;

  return (
    <div className="med-photo-upload-wrapper">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_MIME_TYPES.join(',')}
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Hidden canvas for video snapshots */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Compact Collapsible Photography Guidance */}
      <div className="photo-guide-accordion" style={{ marginBottom: 20 }}>
        <div
          className="photo-guide-accordion__header"
          onClick={() => setIsGuideOpen(!isGuideOpen)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setIsGuideOpen(!isGuideOpen);
            }
          }}
          aria-expanded={isGuideOpen}
        >
          <div className="photo-guide-accordion__title-wrap">
            <div className="photo-guide-accordion__icon-box">
              <Lightbulb size={16} />
            </div>
            <div>
              <span className="photo-guide-accordion__title">
                Forensic Photography Instructions
              </span>
              <span className="photo-guide-accordion__subtitle">
                Clear lighting · Avoid glare · Macro focus
              </span>
            </div>
          </div>

          <button
            type="button"
            className="photo-guide-accordion__toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsGuideOpen(!isGuideOpen);
            }}
          >
            <span>{isGuideOpen ? 'Hide Tips' : 'View Tips'}</span>
            {isGuideOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        <AnimatePresence>
          {isGuideOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="photo-guide-accordion__body"
            >
              <div className="photo-guide-tips-grid">
                <div className="photo-guide-tip-card">
                  <div className="photo-guide-tip-card__heading">
                    <Lightbulb size={14} className="text-emerald-700" />
                    <span>1. Diffuse Lighting</span>
                  </div>
                  <p className="photo-guide-tip-card__desc">
                    Use flat, ambient room light. Avoid direct camera flash on glossy blister foils or reflective carton surfaces.
                  </p>
                </div>

                <div className="photo-guide-tip-card">
                  <div className="photo-guide-tip-card__heading">
                    <Focus size={14} className="text-emerald-700" />
                    <span>2. Sharp Macro Focus</span>
                  </div>
                  <p className="photo-guide-tip-card__desc">
                    Hold camera 15–20 cm away. Keep text, batch stamps, and 2D DataMatrix dot patterns pin-sharp.
                  </p>
                </div>

                <div className="photo-guide-tip-card">
                  <div className="photo-guide-tip-card__heading">
                    <Layers size={14} className="text-emerald-700" />
                    <span>3. Multi-Angle Coverage</span>
                  </div>
                  <p className="photo-guide-tip-card__desc">
                    Front captures product identity; Back captures batch & expiry; Barcode cross-checks GS1 cryptographic data.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3 Distinct Upload Cards Grid */}
      <div className="photo-upload-grid">
        {PRIMARY_SLOTS.map((slotDef) => {
          const photo = photos.find((p) => p.slot === slotDef.slot);
          const hasImage = !!photo;
          const isDragging = draggingSlot === slotDef.slot;

          return (
            <div
              key={slotDef.slot}
              className={`photo-card ${hasImage ? 'photo-card--has-image' : ''} ${
                hasImage && !photo.validation.isValid
                  ? 'photo-card--error'
                  : hasImage && photo.validation.warning
                  ? 'photo-card--warning'
                  : ''
              }`}
            >
              {/* Card Header */}
              <div className="photo-card__header">
                <div className="photo-card__title-box">
                  <div className="photo-card__slot-badge">{slotDef.slotNumber}</div>
                  <span className="photo-card__title">{slotDef.label}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {slotDef.required ? (
                    <span className="photo-card__status-tag photo-card__status-tag--required">
                      Required
                    </span>
                  ) : (
                    <span className="photo-card__status-tag photo-card__status-tag--recommended">
                      Recommended
                    </span>
                  )}
                  {hasImage && photo.validation.isValid && (
                    <CheckCircle2 size={16} color="#059669" />
                  )}
                  {hasImage && !photo.validation.isValid && (
                    <AlertTriangle size={16} color="#dc2626" />
                  )}
                </div>
              </div>

              {/* Purpose Description */}
              <div className="photo-card__purpose">
                <p style={{ margin: 0 }}>{slotDef.purpose}</p>
              </div>

              {/* Card Body: Dropzone or Preview */}
              <div className="photo-card__body">
                {hasImage ? (
                  /* Uploaded State: Thumbnail Preview */
                  <div>
                    <div className="photo-preview-box">
                      <img
                        src={photo.previewUrl}
                        alt={slotDef.label}
                        className="photo-preview-box__img"
                      />

                      {/* Dimension and Size Pill */}
                      <div className="photo-preview-box__meta-pill">
                        {photo.validation.width && photo.validation.height
                          ? `${photo.validation.width}×${photo.validation.height} · ${formatFileSize(photo.file.size)}`
                          : formatFileSize(photo.file.size)}
                      </div>

                      {/* Enlarge Preview Button */}
                      <button
                        type="button"
                        onClick={() => setPreviewModalUrl(photo.previewUrl)}
                        className="photo-preview-box__enlarge-btn"
                        title="Enlarge preview"
                        aria-label="Enlarge preview"
                      >
                        <Maximize2 size={15} />
                      </button>
                    </div>

                    {/* Replace / Retake / Remove Controls */}
                    <div className="photo-uploaded-controls">
                      <button
                        type="button"
                        onClick={() => triggerFileDialog(slotDef.slot)}
                        className="btn-uploaded-replace"
                        title="Replace with file from device"
                      >
                        <UploadCloud size={13} />
                        <span>Replace</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => startCamera(slotDef.slot)}
                        className="btn-uploaded-retake"
                        title="Retake photo using camera"
                      >
                        <RotateCw size={13} />
                        <span>Retake</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => removePhoto(photo.id, e)}
                        className="btn-uploaded-remove"
                        title="Remove photo"
                        aria-label="Remove photo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Validation Feedback Status */}
                    {photo.validation.error ? (
                      <div className="photo-validation-badge photo-validation-badge--error">
                        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{photo.validation.error}</span>
                      </div>
                    ) : photo.validation.warning ? (
                      <div className="photo-validation-badge photo-validation-badge--warning">
                        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{photo.validation.warning}</span>
                      </div>
                    ) : (
                      <div className="photo-validation-badge photo-validation-badge--valid">
                        <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>Sharp & legible · Ready for OCR & GS1 check</span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Empty State: Large Drop Zone with Two Prominent Action Buttons */
                  <div>
                    <div
                      className={`photo-dropzone ${isDragging ? 'photo-dropzone--dragging' : ''}`}
                      onDragOver={(e) => handleDragOver(e, slotDef.slot)}
                      onDragLeave={(e) => handleDragLeave(e, slotDef.slot)}
                      onDrop={(e) => handleDrop(e, slotDef.slot)}
                      onClick={() => triggerFileDialog(slotDef.slot)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          triggerFileDialog(slotDef.slot);
                        }
                      }}
                      title="Click or drag and drop image"
                    >
                      <div className="photo-dropzone__icon-circle">
                        <UploadCloud size={24} />
                      </div>
                      <p className="photo-dropzone__prompt">
                        Drag and drop your photo here
                      </p>
                      <p className="photo-dropzone__subtext">
                        JPG, PNG, WEBP · Max 10 MB
                      </p>

                      {/* Prominent Action Buttons inside Drop Zone */}
                      <div
                        className="photo-card__button-group"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={disabled || isProcessingFile}
                          onClick={() => triggerFileDialog(slotDef.slot)}
                          className="btn-card-choose"
                        >
                          <UploadCloud size={14} />
                          <span>Choose Photo</span>
                        </button>

                        <button
                          type="button"
                          disabled={disabled || isProcessingFile}
                          onClick={() => startCamera(slotDef.slot)}
                          className="btn-card-camera"
                        >
                          <Camera size={14} />
                          <span>Take Photo</span>
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, textAlign: 'center' }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        {slotDef.tip}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary and Prominent Action Footer */}
      <div className="photo-verify-footer" style={{ marginTop: 24 }}>
        <div className="photo-verify-footer__status">
          <div
            className={`photo-verify-footer__badge ${
              isReadyToProceed
                ? 'photo-verify-footer__badge--ready'
                : 'photo-verify-footer__badge--pending'
            }`}
          >
            {totalUploaded}
          </div>
          <div>
            <h4 className="photo-verify-footer__title">
              {isReadyToProceed
                ? totalUploaded === 3
                  ? 'All 3 packaging angles captured & verified'
                  : `${totalUploaded} photos ready (Required angles complete)`
                : hasFront
                ? 'Front photo uploaded · Back/Side label required'
                : hasBack
                ? 'Back photo uploaded · Front packaging required'
                : 'Upload Front and Back packaging photos to continue'}
            </h4>
            <p className="photo-verify-footer__desc">
              {isReadyToProceed
                ? 'Packaging images meet forensic clarity standards. Proceed to extract parameters.'
                : 'Front packaging (brand/strength) and Back label (batch/expiry) are required for verification.'}
            </p>
          </div>
        </div>

        {onProceed && (
          <button
            type="button"
            disabled={disabled || !isReadyToProceed}
            onClick={onProceed}
            className="btn-continue-review"
            title={
              isReadyToProceed
                ? 'Proceed to analyze packaging and review extracted details'
                : 'Upload Front and Back packaging photos first'
            }
          >
            <span>Continue to Review</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>

      {/* Camera Live Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <div className="camera-modal-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="camera-modal-card"
            >
              {/* Modal Header */}
              <div className="camera-modal-header">
                <div className="camera-modal-header__title">
                  <Camera size={18} color="#2dd4bf" />
                  <span>
                    Take Photo: {activeSlotTarget ? PRIMARY_SLOTS.find((s) => s.slot === activeSlotTarget)?.label : 'Medicine Packaging'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="camera-modal-header__close"
                  aria-label="Close camera"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Viewfinder or Retake Preview */}
              <div className="camera-modal-viewfinder">
                {capturedBlob ? (
                  /* Still snapshot preview before committing */
                  <img
                    src={capturedBlob.url}
                    alt="Captured packaging frame"
                    className="camera-modal-retake-preview"
                  />
                ) : (
                  /* Live camera video feed */
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      autoPlay
                      muted
                      className="camera-modal-video"
                    />

                    {/* Forensic Framing Guide Overlay */}
                    <div className="camera-modal-frame-overlay">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="camera-modal-corner camera-modal-corner--tl" />
                        <span className="camera-modal-corner camera-modal-corner--tr" />
                      </div>
                      <div className="camera-modal-hint">
                        <span className="camera-modal-hint__pill">
                          Center packaging label inside the frame
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="camera-modal-corner camera-modal-corner--bl" />
                        <span className="camera-modal-corner camera-modal-corner--br" />
                      </div>
                    </div>
                  </>
                )}

                {cameraError && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(15, 23, 42, 0.95)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 24,
                      textAlign: 'center',
                      color: '#ffffff',
                    }}
                  >
                    <AlertTriangle size={36} color="#f59e0b" style={{ marginBottom: 12 }} />
                    <p style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 360, margin: 0 }}>
                      {cameraError}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        if (activeSlotTarget) triggerFileDialog(activeSlotTarget);
                      }}
                      style={{
                        marginTop: 16,
                        padding: '8px 18px',
                        background: '#0d9488',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Choose Photo From Device
                    </button>
                  </div>
                )}
              </div>

              {/* Controls Footer */}
              <div className="camera-modal-controls">
                {capturedBlob ? (
                  /* Retake or Keep Captured Photo */
                  <div className="camera-retake-actions">
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(capturedBlob.url);
                        setCapturedBlob(null);
                      }}
                      className="btn-camera-retake"
                    >
                      <RotateCw size={15} />
                      <span>Retake</span>
                    </button>

                    <button
                      type="button"
                      onClick={commitCapturedPhoto}
                      className="btn-camera-keep"
                    >
                      <CheckCircle2 size={15} />
                      <span>Use This Photo</span>
                    </button>
                  </div>
                ) : (
                  /* Live Camera Actions */
                  <>
                    <button
                      type="button"
                      onClick={toggleFacingMode}
                      className="btn-camera-flip"
                      title="Switch front and rear cameras"
                    >
                      <RotateCw size={14} />
                      <span>Flip Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={takeSnapshot}
                      className="btn-camera-capture"
                      title="Capture photo"
                      aria-label="Capture photo"
                    >
                      <div className="btn-camera-capture-inner" />
                    </button>

                    <button
                      type="button"
                      onClick={stopCamera}
                      className="btn-camera-cancel"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Enlarged Photo Modal */}
      <AnimatePresence>
        {previewModalUrl && (
          <div
            className="camera-modal-overlay"
            onClick={() => setPreviewModalUrl(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                position: 'relative',
                maxWidth: '90vw',
                maxHeight: '90vh',
                background: '#0f172a',
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreviewModalUrl(null)}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none',
                  borderRadius: '50%',
                  color: '#ffffff',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
              <img
                src={previewModalUrl}
                alt="Enlarged packaging preview"
                style={{
                  maxHeight: '85vh',
                  maxWidth: '85vw',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
