import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Layers,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Info,
  Loader2,
  Edit3,
  Check,
  RefreshCw,
  QrCode,
  Package,
  Clock,
  ArrowRight,
  ShieldAlert,
  Building,
  FileText,
  BookmarkPlus,
  Share2,
} from 'lucide-react';
import { Link, useNavigate } from '../../router';
import {
  MedicinePhotoUpload,
  type PackagingPhotoItem,
} from '../../components/verification/MedicinePhotoUpload';
import {
  uploadPackagingImages,
  analyzePackagingBatch,
  confirmAndVerifyImage,
  addToCabinet,
} from '../../api/client';
import StatusBadge from '../../components/ui/StatusBadge';
import ConfidenceRing from '../../components/ui/ConfidenceRing';
import type {
  ImageAnalysisResult,
  ImageVerificationCombinedResult,
  VerificationResult,
} from '../../types';

type VerificationStep = 'CAPTURE' | 'ANALYZING' | 'CONFIRM' | 'VERIFYING' | 'RESULT';

export const PhotoVerification: React.FC = () => {
  const [step, setStep] = useState<VerificationStep>('CAPTURE');
  const [photos, setPhotos] = useState<PackagingPhotoItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extracted and confirmed data
  const [batchId, setBatchId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResult | null>(null);
  const [confirmedFields, setConfirmedFields] = useState<{
    product_name: string;
    gtin: string;
    batch_number: string;
    serial_number: string;
    expiry_date: string;
    manufacturer: string;
  }>({
    product_name: '',
    gtin: '',
    batch_number: '',
    serial_number: '',
    expiry_date: '',
    manufacturer: '',
  });

  // Final verification result
  const [finalResult, setFinalResult] = useState<ImageVerificationCombinedResult | null>(null);
  const [cabinetSaved, setCabinetSaved] = useState(false);
  const navigate = useNavigate();

  // Step 1 -> Step 2: Upload images and run multimodal AI OCR & packaging analysis
  const handleProceedToAnalysis = async () => {
    const validPhotos = photos.filter((p) => p.validation.isValid);
    if (validPhotos.length === 0) return;

    setErrorMessage(null);
    setStep('ANALYZING');
    setIsProcessing(true);

    try {
      // 1. Upload images to secure backend
      const files = validPhotos.map((p) => p.file);
      const slots = validPhotos.map((p) => p.slot);
      const uploadResp = await uploadPackagingImages(files, slots);
      setBatchId(uploadResp.batch_id);

      // 2. Trigger Gemini Vision & OCR extraction
      const analysis = await analyzePackagingBatch(uploadResp.batch_id);
      setAnalysisResult(analysis);

      // 3. Pre-fill confirmation fields from extracted details
      setConfirmedFields({
        product_name: analysis.medicine_name?.value || '',
        gtin: analysis.gtin?.value || '',
        batch_number: analysis.batch_number?.value || '',
        serial_number: analysis.serial_number?.value || '',
        expiry_date: analysis.expiry_date?.value || '',
        manufacturer: analysis.manufacturer?.value || '',
      });

      setStep('CONFIRM');
    } catch (err: any) {
      console.error('[MedVerify Photo] Analysis failed:', err);
      setErrorMessage(err.message || 'Image analysis failed. Please verify your connection and try again.');
      setStep('CAPTURE');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2 -> Step 3: Submit confirmed parameters to the authoritative 6-factor engine
  const handleConfirmAndVerify = async () => {
    if (!analysisResult || !batchId) return;

    setErrorMessage(null);
    setStep('VERIFYING');
    setIsProcessing(true);

    try {
      const combined = await confirmAndVerifyImage({
        analysis_id: analysisResult.analysis_id,
        batch_id: batchId,
        confirmed_fields: {
          product_name: confirmedFields.product_name.trim() || undefined,
          gtin: confirmedFields.gtin.trim() || undefined,
          batch_number: confirmedFields.batch_number.trim() || undefined,
          serial_number: confirmedFields.serial_number.trim() || undefined,
          expiry_date: confirmedFields.expiry_date.trim() || undefined,
          manufacturer: confirmedFields.manufacturer.trim() || undefined,
        },
      });

      setFinalResult(combined);
      setStep('RESULT');
    } catch (err: any) {
      console.error('[MedVerify Photo] Authoritative verification failed:', err);
      setErrorMessage(err.message || 'Verification engine failed. Please try again.');
      setStep('CONFIRM');
    } finally {
      setIsProcessing(false);
    }
  };

  // Save medicine to cabinet
  const handleSaveToCabinet = async () => {
    if (!finalResult) return;
    try {
      const med = finalResult.verification.medicine;
      await addToCabinet({
        verification_id: finalResult.verification_id,
        product_name: med?.product_name || confirmedFields.product_name || 'Verified Medicine',
        manufacturer: med?.manufacturer || confirmedFields.manufacturer || 'Authorized Manufacturer',
        batch_number: med?.batch_number || confirmedFields.batch_number || 'N/A',
        expiry_date: med?.expiry_date || confirmedFields.expiry_date || undefined,
        notes: `Verified via Medicine Photo Verification (Batch ${confirmedFields.batch_number || 'N/A'})`,
      });
      setCabinetSaved(true);
    } catch (err) {
      console.error('Failed to save to cabinet:', err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => {
            if (step === 'RESULT' || step === 'CONFIRM') {
              setStep('CAPTURE');
            } else {
              navigate('/verify');
            }
          }}
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-slate-500 hover:text-emerald-700 transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>{step === 'CAPTURE' ? 'Back to Verification Hub' : 'Restart Photography'}</span>
        </button>

        {/* Workflow Progress Steps */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <span className={step === 'CAPTURE' ? 'text-emerald-700 font-bold' : ''}>1. Photos</span>
          <span>→</span>
          <span className={step === 'CONFIRM' ? 'text-emerald-700 font-bold' : ''}>2. Review</span>
          <span>→</span>
          <span className={step === 'RESULT' ? 'text-emerald-700 font-bold' : ''}>3. Official Result</span>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-red-950">Verification Notice</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 1: CAPTURE & UPLOAD PACKAGING PHOTOS                       */}
      {/* ============================================================== */}
      {step === 'CAPTURE' && (
        <div className="space-y-6">
          {/* Hero Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-xs font-medium mb-3">
                  <Camera size={13} className="text-emerald-600" />
                  <span>PACKAGING PHOTOGRAPHY & GS1 DECODING</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  Verify Medicine by Photo
                </h1>
                <p className="text-slate-600 text-sm mt-1.5 max-w-2xl leading-relaxed">
                  Photograph the physical packaging from multiple angles. MedVerify reads printed packaging text,
                  decodes GS1 2D DataMatrix barcodes, and cross-checks every parameter against the official pharmaceutical registry.
                </p>
              </div>

              <div className="hidden md:flex flex-col items-end text-right">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Supported Formats
                </span>
                <span className="text-xs font-medium text-slate-700 mt-1">
                  JPG · JPEG · PNG · WEBP (Up to 10MB)
                </span>
              </div>
            </div>
          </div>

          {/* Photo Upload Component */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <MedicinePhotoUpload
              photos={photos}
              onPhotosChange={setPhotos}
              onProceed={handleProceedToAnalysis}
              disabled={isProcessing}
            />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PROCESSING OVERLAY (Analyzing / Verifying)                      */}
      {/* ============================================================== */}
      {(step === 'ANALYZING' || step === 'VERIFYING') && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 mb-4 animate-pulse">
            <Loader2 size={32} className="animate-spin" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {step === 'ANALYZING'
              ? 'Analyzing Packaging & Extracting GS1 Barcodes...'
              : 'Consulting Official Pharmaceutical Registry...'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mt-2 leading-relaxed">
            {step === 'ANALYZING'
              ? 'Reading high-resolution packaging text, inspecting 2D DataMatrix codes, and checking physical carton integrity with Gemini Vision & OCR.'
              : 'Executing authoritative 6-factor deterministic evaluation against registered batches, expiry dates, and serial records.'}
          </p>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 2: REVIEW & CONFIRM EXTRACTED DETAILS                     */}
      {/* ============================================================== */}
      {step === 'CONFIRM' && analysisResult && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                  Step 2 of 3 — Field Confirmation
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                  Review Extracted Packaging Details
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Confirm or correct the extracted values before submitting to the deterministic verification engine.
                </p>
              </div>

              <button
                type="button"
                onClick={handleConfirmAndVerify}
                disabled={isProcessing}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors shadow-sm cursor-pointer"
              >
                <ShieldCheck size={18} />
                <span>Verify with Official Registry</span>
              </button>
            </div>

            {/* Editable Form Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {/* Product Name */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Medicine / Brand Name</label>
                  {analysisResult.medicine_name && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-mono rounded">
                      {analysisResult.medicine_name.extraction_method} · {Math.round(analysisResult.medicine_name.confidence * 100)}%
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={confirmedFields.product_name}
                  onChange={(e) => setConfirmedFields({ ...confirmedFields, product_name: e.target.value })}
                  placeholder="e.g. Amoxicillin 500mg Capsules"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-emerald-600"
                />
              </div>

              {/* Manufacturer */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Manufacturer</label>
                  {analysisResult.manufacturer && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-mono rounded">
                      {analysisResult.manufacturer.extraction_method} · {Math.round(analysisResult.manufacturer.confidence * 100)}%
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={confirmedFields.manufacturer}
                  onChange={(e) => setConfirmedFields({ ...confirmedFields, manufacturer: e.target.value })}
                  placeholder="e.g. PharmaCore Laboratories"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-emerald-600"
                />
              </div>

              {/* GTIN */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Global Trade Item Number (GTIN)</label>
                  {analysisResult.gtin ? (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-mono rounded">
                      {analysisResult.gtin.extraction_method}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 font-mono rounded">
                      null
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={confirmedFields.gtin}
                  onChange={(e) => setConfirmedFields({ ...confirmedFields, gtin: e.target.value })}
                  placeholder="e.g. 08901234567890"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-emerald-600"
                />
              </div>

              {/* Batch Number */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Batch / Lot Number</label>
                  {analysisResult.batch_number ? (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-mono rounded">
                      {analysisResult.batch_number.extraction_method}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 font-mono rounded">
                      null
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={confirmedFields.batch_number}
                  onChange={(e) => setConfirmedFields({ ...confirmedFields, batch_number: e.target.value })}
                  placeholder="e.g. BATCH-2026-001"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-emerald-600"
                />
              </div>

              {/* Expiry Date */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Expiry Date (YYYY-MM-DD)</label>
                  {analysisResult.expiry_date ? (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-mono rounded">
                      {analysisResult.expiry_date.extraction_method}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 font-mono rounded">
                      null
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={confirmedFields.expiry_date}
                  onChange={(e) => setConfirmedFields({ ...confirmedFields, expiry_date: e.target.value })}
                  placeholder="e.g. 2028-01-09"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-emerald-600"
                />
              </div>

              {/* Serial Number */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Serial Number</label>
                  {analysisResult.serial_number ? (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-mono rounded">
                      {analysisResult.serial_number.extraction_method}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 font-mono rounded">
                      null
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={confirmedFields.serial_number}
                  onChange={(e) => setConfirmedFields({ ...confirmedFields, serial_number: e.target.value })}
                  placeholder="e.g. SER-PC-000001"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-emerald-600"
                />
              </div>
            </div>

            {/* Packaging Observations Card */}
            <div className="mt-6 p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Visual Packaging Condition Assessment
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                    analysisResult.packaging_condition.assessment_status === 'TAMPER_WARNING'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {analysisResult.packaging_condition.assessment_status}
                </span>
              </div>

              <p className="text-xs text-slate-600">
                {analysisResult.packaging_condition.summary}
              </p>

              {analysisResult.printed_vs_barcode_mismatch && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-red-600 shrink-0" />
                    <span>Discrepancy Detected Between Printed Label and Barcode</span>
                  </p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    {analysisResult.mismatch_details.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Mandatory Medical / Packaging Disclaimer */}
            <div className="mt-6 p-4 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
              <strong>Mandatory Inspection Disclaimer:</strong> Image analysis and packaging verification cannot guarantee medicine authenticity, quality, storage integrity, or clinical suitability. Consult a licensed pharmacist or physician before use when uncertain.
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 3: AUTHORITATIVE OFFICIAL VERIFICATION RESULT              */}
      {/* ============================================================== */}
      {step === 'RESULT' && finalResult && (
        <div className="space-y-6">
          {/* Verdict Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <ConfidenceRing score={finalResult.confidence_score} status={finalResult.status} size={84} />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={finalResult.status} />
                    <span className="text-xs font-mono text-slate-400">
                      ID: {finalResult.verification_id}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {finalResult.verification.medicine?.product_name || confirmedFields.product_name || 'Medicine Inspection'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Method: IMAGE_VERIFICATION · Verified against MedVerify Pharmaceutical Registry
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleSaveToCabinet}
                  disabled={cabinetSaved}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    cabinetSaved
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <BookmarkPlus size={14} />
                  <span>{cabinetSaved ? 'Saved to Cabinet' : 'Save to Cabinet'}</span>
                </button>

                <Link
                  to="/activity"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-xs"
                >
                  <Clock size={14} />
                  <span>View in My Activity</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Detailed Evidence Breakdown Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column A: Confirmed Medicine Information */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                <FileText size={15} className="text-emerald-700" />
                <span>Medicine Information</span>
              </h3>
              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="text-slate-400 font-medium">Product Name</dt>
                  <dd className="font-semibold text-slate-800">{finalResult.verification.medicine?.product_name || confirmedFields.product_name || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">Manufacturer</dt>
                  <dd className="font-semibold text-slate-800">{finalResult.verification.medicine?.manufacturer || confirmedFields.manufacturer || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">Batch / Lot Number</dt>
                  <dd className="font-mono text-slate-800">{finalResult.verification.medicine?.batch_number || confirmedFields.batch_number || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">Expiration Date</dt>
                  <dd className="font-mono text-slate-800">{finalResult.verification.medicine?.expiry_date || confirmedFields.expiry_date || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">Serial Number</dt>
                  <dd className="font-mono text-slate-800">{finalResult.verification.medicine?.serial_number || confirmedFields.serial_number || 'N/A'}</dd>
                </div>
              </dl>
            </div>

            {/* Column B: Authoritative 6-Factor Checks */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs lg:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-emerald-700" />
                <span>Authoritative 6-Factor Engine Checks</span>
              </h3>
              <div className="space-y-2.5">
                {finalResult.verification.checks.map((c, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{c.name}</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">{c.detail || `Field: ${c.field}`}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        c.status === 'PASS'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.status === 'FAIL'
                          ? 'bg-red-100 text-red-800'
                          : c.status === 'WARN'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column C: Packaging Observations & Recommended Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100">
              Forensic Observations & Actionable Recommendations
            </h3>

            <div className="text-xs text-slate-700 leading-relaxed space-y-2">
              <p>
                <strong>Packaging Condition:</strong> {finalResult.image_analysis.packaging_condition.summary}
              </p>
              {finalResult.status === 'VERIFIED' && (
                <p className="text-emerald-800 font-medium">
                  ✓ All packaging parameters and serial identifiers match authorized manufacturer specifications in the active registry.
                </p>
              )}
              {finalResult.status === 'EXPIRED' && (
                <p className="text-amber-800 font-medium">
                  ⚠ This medicine has passed its expiration date. Do not consume expired medications; return to your dispensing pharmacy for proper disposal.
                </p>
              )}
              {(finalResult.status === 'SUSPICIOUS' || finalResult.status === 'REVIEW') && (
                <p className="text-red-800 font-medium">
                  ⚠ Discrepancies or serial duplication were identified. Quarantine this packaging and consult your dispensing pharmacist or national drug authority.
                </p>
              )}
            </div>

            {/* Mandatory Disclaimer */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-[11px] leading-relaxed">
              Image analysis and packaging verification cannot guarantee medicine authenticity, quality, storage integrity, or clinical suitability. Consult a licensed pharmacist or physician before use when uncertain.
            </div>

            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep('CAPTURE');
                  setPhotos([]);
                  setFinalResult(null);
                  setCabinetSaved(false);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Verify Another Medicine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoVerification;
