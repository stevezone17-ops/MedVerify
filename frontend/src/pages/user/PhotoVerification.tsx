import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  BookmarkPlus,
  Loader2,
  ArrowRight,
  Sparkles,
  HelpCircle,
  Package,
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

  // Save medicine to user cabinet
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
    <div className="photo-verify-container">
      {/* Top Bar: Back Action & 3-Step Progress Stepper */}
      <div className="photo-verify-topbar">
        <button
          type="button"
          onClick={() => {
            if (step === 'RESULT' || step === 'CONFIRM') {
              setStep('CAPTURE');
            } else {
              navigate('/verify');
            }
          }}
          className="photo-verify-back-btn"
        >
          <ArrowLeft size={16} />
          <span>{step === 'CAPTURE' ? 'Back to Verification Hub' : 'Back to Photos'}</span>
        </button>

        {/* 3-Step Progress Indicator */}
        <div className="photo-verify-stepper" role="progressbar" aria-label="Verification Progress">
          <div
            className={`photo-verify-stepper__step ${
              step === 'CAPTURE' || step === 'ANALYZING'
                ? 'photo-verify-stepper__step--active'
                : 'photo-verify-stepper__step--completed'
            }`}
          >
            <span className="photo-verify-stepper__step-num">1</span>
            <span>Upload Photos</span>
          </div>

          <span className="photo-verify-stepper__divider">→</span>

          <div
            className={`photo-verify-stepper__step ${
              step === 'CONFIRM' || step === 'VERIFYING'
                ? 'photo-verify-stepper__step--active'
                : step === 'RESULT'
                ? 'photo-verify-stepper__step--completed'
                : ''
            }`}
          >
            <span className="photo-verify-stepper__step-num">2</span>
            <span>Review Information</span>
          </div>

          <span className="photo-verify-stepper__divider">→</span>

          <div
            className={`photo-verify-stepper__step ${
              step === 'RESULT' ? 'photo-verify-stepper__step--active' : ''
            }`}
          >
            <span className="photo-verify-stepper__step-num">3</span>
            <span>Official Result</span>
          </div>
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 10,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            fontSize: 13,
          }}
        >
          <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ display: 'block', marginBottom: 2 }}>Verification Notice</strong>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 1: CAPTURE & UPLOAD PACKAGING PHOTOS                       */}
      {/* ============================================================== */}
      {step === 'CAPTURE' && (
        <>
          {/* Hero Header Card */}
          <div className="photo-verify-hero">
            <div className="photo-verify-hero__content">
              <div className="photo-verify-hero__eyebrow">
                <Camera size={13} />
                <span>PACKAGING PHOTOGRAPHY & GS1 DECODING</span>
              </div>
              <h1 className="photo-verify-hero__title">
                Verify Medicine by Photo
              </h1>
              <p className="photo-verify-hero__subtitle">
                Photograph physical medicine packaging across the three required dimensions. MedVerify reads printed label text, decodes GS1 2D DataMatrix barcodes, and cross-checks every record against the authorized pharmaceutical registry.
              </p>
            </div>

            <div className="photo-verify-hero__meta">
              <span className="photo-verify-hero__meta-label">Supported Formats</span>
              <span className="photo-verify-hero__meta-val">JPG · PNG · WEBP</span>
              <span className="photo-verify-hero__meta-label" style={{ marginTop: 6 }}>Max File Size</span>
              <span className="photo-verify-hero__meta-val">10 MB per Photo</span>
            </div>
          </div>

          {/* 3 Upload Cards Component */}
          <MedicinePhotoUpload
            photos={photos}
            onPhotosChange={setPhotos}
            onProceed={handleProceedToAnalysis}
            disabled={isProcessing}
          />
        </>
      )}

      {/* ============================================================== */}
      {/* PROCESSING STATE (Analyzing / Verifying)                        */}
      {/* ============================================================== */}
      {(step === 'ANALYZING' || step === 'VERIFYING') && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '60px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 380,
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#f0fdf9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0f766e',
              marginBottom: 16,
            }}
          >
            <Loader2 size={32} className="animate-spin" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
            {step === 'ANALYZING'
              ? 'Extracting Packaging Information & GS1 Barcodes...'
              : 'Consulting Official Pharmaceutical Registry...'}
          </h3>
          <p style={{ fontSize: 13, color: '#64748b', maxWidth: 460, margin: 0, lineHeight: 1.6 }}>
            {step === 'ANALYZING'
              ? 'Reading high-resolution packaging text, inspecting 2D DataMatrix patterns, and checking physical carton integrity with Gemini Vision & OCR.'
              : 'Executing authoritative 6-factor deterministic evaluation against active pharmaceutical registry batches, expiry dates, and serial records.'}
          </p>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 2: REVIEW & CONFIRM EXTRACTED DETAILS                     */}
      {/* ============================================================== */}
      {step === 'CONFIRM' && analysisResult && (
        <div className="photo-review-card">
          <div className="photo-review-header">
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#0f766e', letterSpacing: '0.05em' }}>
                Step 2 of 3 — Field Confirmation
              </span>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '4px 0 0 0' }}>
                Review Extracted Packaging Details
              </h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0 0' }}>
                Confirm or edit the extracted parameters below before submitting to the authoritative deterministic verification engine.
              </p>
            </div>

            <button
              type="button"
              onClick={handleConfirmAndVerify}
              disabled={isProcessing}
              className="btn-continue-review"
            >
              <ShieldCheck size={18} />
              <span>Verify with Official Registry</span>
            </button>
          </div>

          {/* Form Fields Grid */}
          <div className="photo-review-grid">
            {/* Product Name */}
            <div className="photo-review-field">
              <label className="photo-review-label">
                <span>Medicine / Brand Name</span>
                {analysisResult.medicine_name && (
                  <span style={{ fontSize: 10, background: '#f0fdf9', color: '#0f766e', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    {analysisResult.medicine_name.extraction_method} · {Math.round(analysisResult.medicine_name.confidence * 100)}%
                  </span>
                )}
              </label>
              <input
                type="text"
                value={confirmedFields.product_name}
                onChange={(e) => setConfirmedFields({ ...confirmedFields, product_name: e.target.value })}
                placeholder="e.g. Amoxicillin 500mg Capsules"
                className="photo-review-input"
              />
            </div>

            {/* Manufacturer */}
            <div className="photo-review-field">
              <label className="photo-review-label">
                <span>Manufacturer</span>
                {analysisResult.manufacturer && (
                  <span style={{ fontSize: 10, background: '#f0fdf9', color: '#0f766e', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    {analysisResult.manufacturer.extraction_method} · {Math.round(analysisResult.manufacturer.confidence * 100)}%
                  </span>
                )}
              </label>
              <input
                type="text"
                value={confirmedFields.manufacturer}
                onChange={(e) => setConfirmedFields({ ...confirmedFields, manufacturer: e.target.value })}
                placeholder="e.g. PharmaCore Laboratories"
                className="photo-review-input"
              />
            </div>

            {/* GTIN */}
            <div className="photo-review-field">
              <label className="photo-review-label">
                <span>Global Trade Item Number (GTIN)</span>
                {analysisResult.gtin ? (
                  <span style={{ fontSize: 10, background: '#f0fdf9', color: '#0f766e', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    {analysisResult.gtin.extraction_method}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    null
                  </span>
                )}
              </label>
              <input
                type="text"
                value={confirmedFields.gtin}
                onChange={(e) => setConfirmedFields({ ...confirmedFields, gtin: e.target.value })}
                placeholder="e.g. 08901234567890"
                className="photo-review-input font-mono"
              />
            </div>

            {/* Batch Number */}
            <div className="photo-review-field">
              <label className="photo-review-label">
                <span>Batch / Lot Number</span>
                {analysisResult.batch_number ? (
                  <span style={{ fontSize: 10, background: '#f0fdf9', color: '#0f766e', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    {analysisResult.batch_number.extraction_method}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    null
                  </span>
                )}
              </label>
              <input
                type="text"
                value={confirmedFields.batch_number}
                onChange={(e) => setConfirmedFields({ ...confirmedFields, batch_number: e.target.value })}
                placeholder="e.g. BATCH-2026-001"
                className="photo-review-input font-mono"
              />
            </div>

            {/* Expiry Date */}
            <div className="photo-review-field">
              <label className="photo-review-label">
                <span>Expiry Date (YYYY-MM-DD)</span>
                {analysisResult.expiry_date ? (
                  <span style={{ fontSize: 10, background: '#f0fdf9', color: '#0f766e', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    {analysisResult.expiry_date.extraction_method}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    null
                  </span>
                )}
              </label>
              <input
                type="text"
                value={confirmedFields.expiry_date}
                onChange={(e) => setConfirmedFields({ ...confirmedFields, expiry_date: e.target.value })}
                placeholder="e.g. 2028-01-09"
                className="photo-review-input font-mono"
              />
            </div>

            {/* Serial Number */}
            <div className="photo-review-field">
              <label className="photo-review-label">
                <span>Serial Number</span>
                {analysisResult.serial_number ? (
                  <span style={{ fontSize: 10, background: '#f0fdf9', color: '#0f766e', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    {analysisResult.serial_number.extraction_method}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                    null
                  </span>
                )}
              </label>
              <input
                type="text"
                value={confirmedFields.serial_number}
                onChange={(e) => setConfirmedFields({ ...confirmedFields, serial_number: e.target.value })}
                placeholder="e.g. SER-PC-000001"
                className="photo-review-input font-mono"
              />
            </div>
          </div>

          {/* Visual Packaging Condition Observations */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#334155', letterSpacing: '0.04em' }}>
                Visual Packaging Condition Assessment
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: 4,
                  background:
                    analysisResult.packaging_condition.assessment_status === 'TAMPER_WARNING'
                      ? '#fef3c7'
                      : '#ecfdf5',
                  color:
                    analysisResult.packaging_condition.assessment_status === 'TAMPER_WARNING'
                      ? '#92400e'
                      : '#065f46',
                  border:
                    analysisResult.packaging_condition.assessment_status === 'TAMPER_WARNING'
                      ? '1px solid #fde68a'
                      : '1px solid #a7f3d0',
                }}
              >
                {analysisResult.packaging_condition.assessment_status}
              </span>
            </div>

            <p style={{ fontSize: 12.5, color: '#475569', margin: 0, lineHeight: 1.5 }}>
              {analysisResult.packaging_condition.summary}
            </p>

            {analysisResult.printed_vs_barcode_mismatch && (
              <div
                style={{
                  marginTop: 6,
                  padding: 12,
                  borderRadius: 8,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: 12,
                }}
              >
                <p style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 6px 0' }}>
                  <AlertTriangle size={15} color="#dc2626" />
                  <span>Discrepancy Detected Between Printed Label and Barcode</span>
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                  {analysisResult.mismatch_details.map((m, idx) => (
                    <li key={idx}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Mandatory Medical Disclaimer */}
          <div className="photo-disclaimer-box">
            <strong>Mandatory Healthcare Disclaimer:</strong> Image analysis and packaging verification cannot guarantee medicine authenticity, quality, storage integrity, or clinical suitability. Consult a licensed pharmacist or physician before use when uncertain.
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STEP 3: AUTHORITATIVE OFFICIAL VERIFICATION RESULT              */}
      {/* ============================================================== */}
      {step === 'RESULT' && finalResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Official Certificate Banner */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              padding: '24px 28px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <ConfidenceRing score={finalResult.confidence_score} status={finalResult.status} size={84} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <StatusBadge status={finalResult.status} />
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>
                      ID: {finalResult.verification_id}
                    </span>
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                    {finalResult.verification.medicine?.product_name || confirmedFields.product_name || 'Medicine Inspection'}
                  </h2>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                    Method: IMAGE_VERIFICATION · Verified against MedVerify Pharmaceutical Registry
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSaveToCabinet}
                  disabled={cabinetSaved}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '9px 16px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: cabinetSaved ? '#ecfdf5' : '#ffffff',
                    color: cabinetSaved ? '#065f46' : '#334155',
                    border: cabinetSaved ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
                    cursor: cabinetSaved ? 'default' : 'pointer',
                  }}
                >
                  <BookmarkPlus size={15} />
                  <span>{cabinetSaved ? 'Saved to Cabinet' : 'Save to Cabinet'}</span>
                </button>

                <Link
                  to="/activity"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '9px 16px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: '#0f172a',
                    color: '#ffffff',
                    textDecoration: 'none',
                  }}
                >
                  <Clock size={15} />
                  <span>View in My Activity</span>
                </Link>
              </div>
            </div>
          </div>

          {/* 6-Factor Checks and Medicine Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {/* Medicine Specimen Details */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                padding: 20,
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              }}
            >
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#334155',
                  margin: '0 0 16px 0',
                  paddingBottom: 8,
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <FileText size={15} color="#0f766e" />
                <span>Medicine Specimen Information</span>
              </h3>
              <dl style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: 0, fontSize: 12.5 }}>
                <div>
                  <dt style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>Product Name</dt>
                  <dd style={{ color: '#0f172a', fontWeight: 600, margin: '2px 0 0 0' }}>
                    {finalResult.verification.medicine?.product_name || confirmedFields.product_name || 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>Manufacturer</dt>
                  <dd style={{ color: '#0f172a', fontWeight: 600, margin: '2px 0 0 0' }}>
                    {finalResult.verification.medicine?.manufacturer || confirmedFields.manufacturer || 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>Batch / Lot Number</dt>
                  <dd style={{ color: '#0f172a', fontFamily: 'var(--font-mono)', fontWeight: 600, margin: '2px 0 0 0' }}>
                    {finalResult.verification.medicine?.batch_number || confirmedFields.batch_number || 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>Expiration Date</dt>
                  <dd style={{ color: '#0f172a', fontFamily: 'var(--font-mono)', fontWeight: 600, margin: '2px 0 0 0' }}>
                    {finalResult.verification.medicine?.expiry_date || confirmedFields.expiry_date || 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>Serial Number</dt>
                  <dd style={{ color: '#0f172a', fontFamily: 'var(--font-mono)', fontWeight: 600, margin: '2px 0 0 0' }}>
                    {finalResult.verification.medicine?.serial_number || confirmedFields.serial_number || 'N/A'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Authoritative 6-Factor Checks */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                padding: 20,
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              }}
            >
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#334155',
                  margin: '0 0 16px 0',
                  paddingBottom: 8,
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <ShieldCheck size={15} color="#0f766e" />
                <span>Deterministic 6-Factor Engine Checks</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {finalResult.verification.checks.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: '#f8fafc',
                      border: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12.5,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{c.name}</span>
                      <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748b' }}>
                        {c.detail || `Field: ${c.field}`}
                      </p>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10.5,
                        fontWeight: 700,
                        background:
                          c.status === 'PASS'
                            ? '#ecfdf5'
                            : c.status === 'FAIL'
                            ? '#fef2f2'
                            : '#fffbeb',
                        color:
                          c.status === 'PASS'
                            ? '#065f46'
                            : c.status === 'FAIL'
                            ? '#991b1b'
                            : '#92400e',
                      }}
                    >
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Observations & Actions Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              padding: 24,
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <h3
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#334155',
                margin: 0,
                paddingBottom: 8,
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              Forensic Observations & Actionable Recommendations
            </h3>

            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0 }}>
                <strong>Packaging Condition:</strong> {finalResult.image_analysis.packaging_condition.summary}
              </p>
              {finalResult.status === 'VERIFIED' && (
                <p style={{ margin: 0, color: '#065f46', fontWeight: 600 }}>
                  ✓ All packaging parameters and serial identifiers match authorized manufacturer specifications in the active registry.
                </p>
              )}
              {finalResult.status === 'EXPIRED' && (
                <p style={{ margin: 0, color: '#92400e', fontWeight: 600 }}>
                  ⚠ This medicine has passed its expiration date. Do not consume expired medications; return to your dispensing pharmacy for proper disposal.
                </p>
              )}
              {(finalResult.status === 'SUSPICIOUS' || finalResult.status === 'REVIEW') && (
                <p style={{ margin: 0, color: '#991b1b', fontWeight: 600 }}>
                  ⚠ Discrepancies or serial duplication were identified. Quarantine this packaging and consult your dispensing pharmacist or national drug authority.
                </p>
              )}
            </div>

            <div className="photo-disclaimer-box">
              {finalResult.image_analysis.mandatory_disclaimer || 'Image analysis and packaging verification cannot guarantee medicine authenticity, quality, storage integrity, or clinical suitability. Consult a licensed pharmacist or physician before use when uncertain.'}
            </div>

            <div style={{ paddingTop: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setStep('CAPTURE');
                  setPhotos([]);
                  setFinalResult(null);
                  setCabinetSaved(false);
                }}
                className="btn-card-choose"
                style={{ flex: 'none', padding: '10px 20px', width: 'auto' }}
              >
                <span>Verify Another Medicine</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoVerification;
