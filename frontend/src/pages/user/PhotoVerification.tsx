import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Camera,
  Layers,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Info,
} from 'lucide-react';
import { Link, useNavigate } from '../../router';
import {
  MedicinePhotoUpload,
  type PackagingPhotoItem,
} from '../../components/verification/MedicinePhotoUpload';

export const PhotoVerification: React.FC = () => {
  const [photos, setPhotos] = useState<PackagingPhotoItem[]>([]);
  const [stageNotice, setStageNotice] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleProceed = () => {
    const validCount = photos.filter((p) => p.validation.isValid).length;
    if (validCount === 0) return;

    setStageNotice(
      `Captured ${validCount} high-resolution packaging photo${validCount > 1 ? 's' : ''}. Image upload and camera capture validated successfully.`
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/verify"
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-slate-500 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Verification Hub</span>
        </Link>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Packaging Inspection Mode</span>
        </div>
      </div>

      {/* Hero Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-xs font-medium mb-3">
              <Camera size={13} className="text-emerald-600" />
              <span>MULTIPLE PACKAGING PHOTOGRAPHY</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Verify Medicine by Photo
            </h1>
            <p className="text-slate-600 text-sm mt-1.5 max-w-2xl leading-relaxed">
              Capture or upload multi-angle packaging photographs. MedVerify inspects packaging text,
              GS1 DataMatrix codes, batch numbers, and visible condition against the official pharmaceutical registry.
            </p>
          </div>

          <div className="hidden md:flex flex-col items-end text-right">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Supported Formats
            </span>
            <span className="text-xs font-medium text-slate-700 mt-1">
              JPG · JPEG · PNG · WEBP (Up to 10MB)
            </span>
            <span className="text-[11px] text-emerald-700 mt-0.5">
              Multi-angle capture supported
            </span>
          </div>
        </div>
      </div>

      {/* Main Upload / Camera View */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs mb-6">
        <MedicinePhotoUpload
          photos={photos}
          onPhotosChange={setPhotos}
          onProceed={handleProceed}
        />

        {stageNotice && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3"
          >
            <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold text-emerald-950">Image Capture Ready</p>
              <p className="mt-0.5">{stageNotice}</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Photography Guidelines & Instructions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-xs mb-2.5">
            01
          </div>
          <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
            Front Packaging
          </h4>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Photograph the front carton showing the brand name, active ingredients, dosage, and manufacturer brand.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-xs mb-2.5">
            02
          </div>
          <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
            Back & Batch Details
          </h4>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Ensure the printed batch/lot number, manufacturing date, and expiry date are in crisp focus without glare.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-xs mb-2.5">
            03
          </div>
          <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
            Barcode / DataMatrix
          </h4>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Include the 2D DataMatrix code or linear barcode to cross-check GS1 serialization against printed details.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PhotoVerification;
