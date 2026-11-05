import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  CameraOff,
  UploadCloud,
  X,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Plus,
  Maximize2,
  Trash2,
  Sparkles,
  Info,
  ShieldCheck,
  RotateCw,
  Layers,
} from 'lucide-react';
import {
  validatePackagingImage,
  formatFileSize,
  type ImageValidationResult,
  ALLOWED_MIME_TYPES,
} from '../../utils/imageQuality';

export type PhotoSlotType = 'front' | 'back' | 'barcode' | 'blister' | 'custom';

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

const DEFAULT_SLOTS: { slot: PhotoSlotType; label: string; desc: string; required?: boolean }[] = [
  {
    slot: 'front',
    label: 'Front Packaging',
    desc: 'Medicine name, brand, strength, and dosage form',
    required: true,
  },
  {
    slot: 'back',
    label: 'Back / Side Label',
    desc: 'Batch/lot number, expiry date, and manufacturer info',
    required: true,
  },
  {
    slot: 'barcode',
    label: 'Barcode / DataMatrix',
    desc: 'GS1 2D DataMatrix code or linear packaging barcode',
  },
  {
    slot: 'blister',
    label: 'Blister Foil / Extra Angle',
    desc: 'Internal blister foil, hologram, or tamper-evident seal',
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Helper to find photo by slot
  const getPhotoForSlot = (slot: PhotoSlotType) => photos.find((p) => p.slot === slot);

  // Stop camera media tracks
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
  }, []);

  // Start device camera
  const startCamera = useCallback(
    async (targetSlot: PhotoSlotType) => {
      setActiveSlotTarget(targetSlot);
      setCameraError(null);
      setIsCameraOpen(true);

      try {
        if (streamRef.current) {
          stopCamera();
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
          videoRef.current.play();
        }
      } catch (err: any) {
        console.error('[MedVerify Photo] Camera access error:', err);
        setCameraError(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please enable camera access in your browser settings or upload a saved photo.'
            : `Could not initialize camera: ${err.message || 'Device camera unavailable.'}`
        );
      }
    },
    [facingMode, stopCamera]
  );

  // Flip camera (front/back)
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

  // Capture frame from camera video feed
  const captureSnapshot = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !activeSlotTarget) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;

        const timestamp = Date.now();
        const file = new File(
          [blob],
          `medverify_${activeSlotTarget}_${timestamp}.jpg`,
          { type: 'image/jpeg' }
        );

        setIsProcessingFile(true);
        const validation = await validatePackagingImage(file);
        setIsProcessingFile(false);

        const slotDef = DEFAULT_SLOTS.find((s) => s.slot === activeSlotTarget);
        const label = slotDef ? slotDef.label : 'Packaging Photo';

        const newItem: PackagingPhotoItem = {
          id: `photo_${timestamp}_${Math.random().toString(36).slice(2, 7)}`,
          slot: activeSlotTarget,
          label,
          file,
          previewUrl: URL.createObjectURL(blob),
          validation,
          timestamp,
        };

        // Replace if slot already exists, otherwise add
        const updated = photos.filter((p) => p.slot !== activeSlotTarget);
        onPhotosChange([...updated, newItem]);
        stopCamera();
      },
      'image/jpeg',
      0.92
    );
  }, [activeSlotTarget, photos, onPhotosChange, stopCamera]);

  // Handle local file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeSlotTarget) return;

    const file = files[0];
    setIsProcessingFile(true);
    const validation = await validatePackagingImage(file);
    setIsProcessingFile(false);

    const slotDef = DEFAULT_SLOTS.find((s) => s.slot === activeSlotTarget);
    const label = slotDef ? slotDef.label : 'Packaging Photo';
    const timestamp = Date.now();

    const newItem: PackagingPhotoItem = {
      id: `photo_${timestamp}_${Math.random().toString(36).slice(2, 7)}`,
      slot: activeSlotTarget,
      label,
      file,
      previewUrl: URL.createObjectURL(file),
      validation,
      timestamp,
    };

    const updated = photos.filter((p) => p.slot !== activeSlotTarget);
    onPhotosChange([...updated, newItem]);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Trigger file dialog for a specific slot
  const triggerFileDialog = (slot: PhotoSlotType) => {
    setActiveSlotTarget(slot);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Remove photo
  const removePhoto = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = photos.find((p) => p.id === id);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
    }
    onPhotosChange(photos.filter((p) => p.id !== id));
  };

  // Total valid photos
  const validPhotos = photos.filter((p) => p.validation.isValid);
  const hasFrontOrBack = photos.some((p) => (p.slot === 'front' || p.slot === 'back') && p.validation.isValid);

  return (
    <div className="med-photo-upload-wrapper">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_MIME_TYPES.join(',')}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Hidden offscreen canvas for snapshot grab */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Header Guidance Banner */}
      <div className="med-photo-guidance-card">
        <div className="med-photo-guidance-icon">
          <Layers size={22} className="text-emerald-700" />
        </div>
        <div className="med-photo-guidance-text">
          <h4 className="font-semibold text-slate-800 text-sm tracking-wide uppercase">
            Forensic Packaging Photography Guide
          </h4>
          <p className="text-xs text-slate-600 mt-0.5">
            Photograph the <strong>Front</strong> (brand and strength), <strong>Back</strong> (batch number, expiry, manufacturer),
            and any <strong>GS1 2D DataMatrix or Barcode</strong>. For best OCR accuracy, ensure good lighting and avoid reflections.
          </p>
        </div>
      </div>

      {/* Preset Photo Slots Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {DEFAULT_SLOTS.map((slotDef) => {
          const photo = getPhotoForSlot(slotDef.slot);
          const hasImage = !!photo;

          return (
            <div
              key={slotDef.slot}
              className={`relative flex flex-col rounded-xl border transition-all overflow-hidden ${
                hasImage
                  ? photo.validation.isValid
                    ? photo.validation.warning
                      ? 'border-amber-300 bg-amber-50/20'
                      : 'border-emerald-300 bg-emerald-50/20'
                    : 'border-red-300 bg-red-50/20'
                  : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
              }`}
            >
              {/* Card Header */}
              <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {slotDef.label}
                  </span>
                  {slotDef.required && (
                    <span className="text-[10px] font-medium uppercase px-1.5 py-0.2 text-emerald-700 bg-emerald-100 rounded">
                      Required
                    </span>
                  )}
                </div>

                {hasImage && photo.validation.isValid && (
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                )}
                {hasImage && !photo.validation.isValid && (
                  <AlertTriangle size={15} className="text-red-500 shrink-0" />
                )}
              </div>

              {/* Card Body / Preview or Upload Target */}
              <div className="p-3.5 flex-1 flex flex-col justify-between">
                {hasImage ? (
                  <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-900 aspect-4/3 flex items-center justify-center">
                    <img
                      src={photo.previewUrl}
                      alt={photo.label}
                      className="w-full h-full object-cover"
                    />

                    {/* Image overlay actions */}
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewModalUrl(photo.previewUrl)}
                        className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-md text-xs shadow transition-colors"
                        title="Enlarge preview"
                      >
                        <Maximize2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerFileDialog(slotDef.slot)}
                        className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-md text-xs shadow transition-colors"
                        title="Replace photo"
                      >
                        <RotateCw size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => removePhoto(photo.id, e)}
                        className="p-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-md text-xs shadow transition-colors"
                        title="Remove photo"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Dimension / Size Pill */}
                    <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] text-white font-mono">
                      {photo.validation.width && photo.validation.height
                        ? `${photo.validation.width}×${photo.validation.height} · ${formatFileSize(photo.file.size)}`
                        : formatFileSize(photo.file.size)}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg p-4 text-center aspect-4/3 bg-slate-50/50">
                    <ImageIcon size={28} className="text-slate-400 mb-2 stroke-[1.5]" />
                    <p className="text-xs text-slate-600 line-clamp-2">{slotDef.desc}</p>

                    <div className="flex items-center gap-2 mt-3 w-full">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => startCamera(slotDef.slot)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors shadow-2xs"
                      >
                        <Camera size={13} className="text-emerald-700" />
                        <span>Camera</span>
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => triggerFileDialog(slotDef.slot)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors shadow-2xs"
                      >
                        <UploadCloud size={13} className="text-slate-500" />
                        <span>Upload</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Validation Feedback */}
                {hasImage && (
                  <div className="mt-2 text-[11px] leading-tight">
                    {photo.validation.error && (
                      <p className="text-red-600 font-medium flex items-start gap-1">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>{photo.validation.error}</span>
                      </p>
                    )}
                    {photo.validation.isValid && photo.validation.warning && (
                      <p className="text-amber-700 flex items-start gap-1">
                        <Info size={12} className="shrink-0 mt-0.5" />
                        <span>{photo.validation.warning}</span>
                      </p>
                    )}
                    {photo.validation.isValid && !photo.validation.warning && (
                      <p className="text-emerald-700 font-medium flex items-center gap-1">
                        <CheckCircle2 size={12} className="shrink-0" />
                        <span>Ready for OCR & GS1 extraction</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Action Bar */}
      <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-sm">
            {validPhotos.length}
          </div>
          <div>
            <h5 className="text-sm font-semibold text-slate-800">
              {validPhotos.length === 0
                ? 'No packaging photos captured yet'
                : `${validPhotos.length} photo${validPhotos.length > 1 ? 's' : ''} prepared for verification`}
            </h5>
            <p className="text-xs text-slate-500">
              {hasFrontOrBack
                ? 'Minimum packaging requirements met. You can add more angles or proceed.'
                : 'Please provide at least the Front or Back packaging photo to extract text and barcodes.'}
            </p>
          </div>
        </div>

        {onProceed && (
          <button
            type="button"
            disabled={disabled || !hasFrontOrBack}
            onClick={onProceed}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
              hasFrontOrBack
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <ShieldCheck size={18} />
            <span>Proceed with Medicine Photos</span>
          </button>
        )}
      </div>

      {/* Live Camera Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xl bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <Camera size={18} className="text-emerald-400" />
                  <span className="font-semibold text-sm">
                    Capture {activeSlotTarget ? DEFAULT_SLOTS.find((s) => s.slot === activeSlotTarget)?.label : 'Photo'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Viewfinder Area */}
              <div className="relative aspect-4/3 bg-black flex items-center justify-center overflow-hidden">
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Packaging Alignment Guide Frame */}
                <div className="absolute inset-8 border-2 border-emerald-400/70 border-dashed rounded-xl pointer-events-none flex flex-col justify-between p-3">
                  <div className="flex justify-between">
                    <span className="w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                    <span className="w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                  </div>
                  <div className="text-center">
                    <span className="bg-black/60 text-white text-[11px] px-2 py-1 rounded backdrop-blur-xs">
                      Align packaging text and barcode inside box
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                    <span className="w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
                  </div>
                </div>

                {cameraError && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center text-white">
                    <AlertTriangle size={36} className="text-amber-400 mb-2" />
                    <p className="text-sm font-medium">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => activeSlotTarget && triggerFileDialog(activeSlotTarget)}
                      className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow"
                    >
                      Choose from Device Files
                    </button>
                  </div>
                )}
              </div>

              {/* Camera Controls */}
              <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                  title="Switch camera"
                >
                  <RotateCw size={15} />
                  <span className="hidden sm:inline">Flip</span>
                </button>

                <button
                  type="button"
                  onClick={captureSnapshot}
                  className="w-14 h-14 rounded-full bg-white hover:bg-slate-100 border-4 border-emerald-500 shadow-lg flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                  title="Take photo"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-600" />
                </button>

                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-3 py-1.5 text-slate-400 hover:text-white text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Enlarged Photo Preview Modal */}
      <AnimatePresence>
        {previewModalUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
            onClick={() => setPreviewModalUrl(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-3xl max-h-[90vh] bg-slate-900 rounded-xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreviewModalUrl(null)}
                className="absolute top-3 right-3 p-1.5 bg-black/60 hover:bg-black/90 text-white rounded-full transition-colors z-10"
              >
                <X size={18} />
              </button>
              <img
                src={previewModalUrl}
                alt="Enlarged packaging preview"
                className="max-h-[85vh] w-auto object-contain"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

