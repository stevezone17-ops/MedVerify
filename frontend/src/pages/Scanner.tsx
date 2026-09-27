import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  Keyboard,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { useLocation } from '../router';
import { verifyMedicine, getStoredUser } from '../api/client';
import { pageVariants } from '../animations/motion';
import type { VerificationResult } from '../types';
import { parseGS1Payload } from '../utils/gs1Parser';

/* Modular Scanner Components */
import CameraScanner from '../components/scanner/CameraScanner';
import ManualPayloadForm from '../components/scanner/ManualPayloadForm';
import DemoScenarios, { DemoScenarioItem } from '../components/scanner/DemoScenarios';
import VerificationResultPanel from '../components/scanner/VerificationResultPanel';

type ScannerMode = 'camera' | 'manual' | 'demo';

export default function Scanner() {
  const location = useLocation();
  const user = getStoredUser();
  const isAdmin = user?.role === 'admin';

  const [mode, setMode] = useState<ScannerMode>(() => {
    if (location.search.includes('mode=manual')) return 'manual';
    if (location.search.includes('mode=demo')) return 'demo';
    return 'camera';
  });
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [lastScannedPayload, setLastScannedPayload] = useState<string>('');
  const [error, setError] = useState<{ title: string; message: string; canRetry?: boolean } | null>(null);

  // Core real-time verification handler
  const executeVerification = async (params: {
    identifier: string;
    batch_number?: string;
    serial_number?: string;
    expiry_date?: string;
  }) => {
    setError(null);
    setIsVerifying(true);
    setLastScannedPayload(params.identifier);

    try {
      // 1. Call real backend API endpoint: POST /api/verify
      const result = await verifyMedicine({
        identifier: params.identifier.trim(),
        batch_number: params.batch_number?.trim() || undefined,
        serial_number: params.serial_number?.trim() || undefined,
        expiry_date: params.expiry_date?.trim() || undefined,
      });

      // 2. Set result to display in-place
      setVerificationResult(result);
    } catch (err: any) {
      console.error('[MedVerify Scanner] Verification execution error:', err);

      if (err.isNetworkError || err.status === 404 || err.status === 500 || err.status === 503) {
        setError({
          title: 'VERIFICATION SERVICE UNAVAILABLE',
          message: 'The medicine code was received, but the backend verification engine or registry could not be reached.',
          canRetry: true,
        });
      } else {
        setError({
          title: 'VERIFICATION ERROR',
          message: err.message || 'The verification engine encountered an unexpected error processing this payload.',
          canRetry: true,
        });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Callback from CameraScanner when code detected
  const handleCodeDetected = (rawCode: string) => {
    // Parse GS1 / Barcode payload
    const parsed = parseGS1Payload(rawCode);

    executeVerification({
      identifier: parsed.gtin || rawCode,
      batch_number: parsed.batch,
      serial_number: parsed.serial,
      expiry_date: parsed.expiry,
    });
  };

  // Callback from Manual Payload Form
  const handleManualSubmit = (params: {
    identifier: string;
    batch?: string;
    serial?: string;
    expiry?: string;
  }) => {
    executeVerification({
      identifier: params.identifier,
      batch_number: params.batch,
      serial_number: params.serial,
      expiry_date: params.expiry,
    });
  };

  // Callback from Demo Scenarios
  const handleDemoScenario = (scenario: DemoScenarioItem) => {
    executeVerification({
      identifier: scenario.identifier,
      batch_number: scenario.batch,
      serial_number: scenario.serial,
      expiry_date: scenario.expiry,
    });
  };

  // Reset to scan another medicine
  const handleScanAnother = () => {
    setVerificationResult(null);
    setError(null);
    setLastScannedPayload('');
  };

  // Pipeline stepper state
  const currentStep = verificationResult ? 4 : isVerifying ? 3 : mode === 'camera' ? 1 : 2;

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="scanner-container-root"
    >
      {/* 1. Precision Pipeline Step Tracker */}
      <div className="scanner-pipeline-stepper" role="navigation" aria-label="Verification Pipeline Steps">
        {[
          { num: '01', label: 'Optical Capture', step: 1 },
          { num: '02', label: 'GS1 Normalization', step: 2 },
          { num: '03', label: 'Registry Cross-Check', step: 3 },
          { num: '04', label: 'Cryptographic Verdict', step: 4 },
        ].map((st) => {
          const isDone = currentStep > st.step;
          const isCurrent = currentStep === st.step;

          return (
            <div
              key={st.num}
              className={`pipeline-step ${isCurrent ? 'is-current' : ''} ${isDone ? 'is-done' : ''}`}
            >
              <span className="pipeline-step-num font-mono">
                {isDone ? '✓' : st.num}
              </span>
              <span className="pipeline-step-label">{st.label}</span>
            </div>
          );
        })}
      </div>

      {/* 2. Main Verification Viewport / Result Card */}
      <div className="scanner-main-card">
        {/* If verification result exists, show Result Panel; otherwise show Scanner */}
        <AnimatePresence mode="wait">
          {verificationResult ? (
            <VerificationResultPanel
              key="result"
              result={verificationResult}
              onScanAnother={handleScanAnother}
            />
          ) : (
            <div key="scanner" className="scanner-view-content">
              {/* Input Mode Selector Tabs */}
              <div className="scanner-mode-tab-bar" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'camera'}
                  className={`scanner-mode-btn ${mode === 'camera' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode('camera');
                    setError(null);
                  }}
                  disabled={isVerifying}
                >
                  <ScanLine size={15} />
                  <span>Optical Camera Scan</span>
                  {mode === 'camera' && (
                    <motion.div
                      layoutId="scannerModeTab"
                      className="scanner-mode-active-pill"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'manual'}
                  className={`scanner-mode-btn ${mode === 'manual' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode('manual');
                    setError(null);
                  }}
                  disabled={isVerifying}
                >
                  <Keyboard size={15} />
                  <span>Manual Payload Entry</span>
                  {mode === 'manual' && (
                    <motion.div
                      layoutId="scannerModeTab"
                      className="scanner-mode-active-pill"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'demo'}
                  className={`scanner-mode-btn ${mode === 'demo' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode('demo');
                    setError(null);
                  }}
                  disabled={isVerifying}
                >
                  <Sparkles size={15} />
                  <span>Benchmark Scenarios</span>
                  {mode === 'demo' && (
                    <motion.div
                      layoutId="scannerModeTab"
                      className="scanner-mode-active-pill"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              </div>

              {/* Error Notice */}
              {error && (
                <div className="scanner-network-error-banner">
                  <div className="error-banner-lead">
                    <AlertTriangle size={18} className="error-icon" />
                    <div>
                      <h4 className="error-title">{error.title}</h4>
                      <p className="error-desc">{error.message}</p>
                    </div>
                  </div>
                  <div className="error-banner-actions">
                    {error.canRetry && lastScannedPayload && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => executeVerification({ identifier: lastScannedPayload })}
                      >
                        <RefreshCw size={13} />
                        <span>Retry Verification</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setError(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Verifying In-Flight Progress Animation */}
              {isVerifying && (
                <div className="scanner-verifying-overlay" aria-live="assertive">
                  <div className="telemetry-spinner" style={{ width: 44, height: 44 }} />
                  <h3 className="verifying-title">CROSS-CHECKING PHARMACEUTICAL REGISTRY</h3>
                  <p className="verifying-subtext font-mono">
                    Querying MongoDB ledger for {lastScannedPayload || 'specimen'}...
                  </p>
                </div>
              )}

              {/* Mode Views */}
              {!isVerifying && (
                <>
                  {mode === 'camera' && (
                    <CameraScanner
                      onCodeDetected={handleCodeDetected}
                      onSwitchToManual={() => setMode('manual')}
                      isVerifying={isVerifying}
                    />
                  )}

                  {mode === 'manual' && (
                    <ManualPayloadForm
                      onSubmit={handleManualSubmit}
                      isVerifying={isVerifying}
                    />
                  )}

                  {mode === 'demo' && (
                    <DemoScenarios
                      onSelectAndExecute={handleDemoScenario}
                      isVerifying={isVerifying}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Screen Reader Announcements */}
      <div className="sr-only" aria-live="polite">
        {isVerifying && 'Verification in progress, querying pharmaceutical registry.'}
        {verificationResult && `Verification complete. Result is ${verificationResult.status} with confidence ${verificationResult.confidence_score} percent.`}
      </div>
    </motion.div>
  );
}
