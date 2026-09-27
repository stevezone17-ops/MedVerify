import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  CameraOff,
  RefreshCw,
  QrCode,
  AlertTriangle,
  CheckCircle2,
  Keyboard,
  ShieldCheck,
  Video,
  Sparkles,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getBarcodeScanner, DetectedBarcode } from '../../utils/barcodeDetector';

export type CameraStatus =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'CAMERA_ACTIVE'
  | 'SCANNING'
  | 'DETECTED'
  | 'DECODING'
  | 'ERROR';

interface CameraScannerProps {
  onCodeDetected: (code: string, format?: string) => void;
  onSwitchToManual: () => void;
  isVerifying: boolean;
  className?: string;
}

interface DiagnosticInfo {
  status: string;
  detectedFormat: string;
  rawPayload: string;
  fps: number;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  onCodeDetected,
  onSwitchToManual,
  isVerifying,
  className = '',
}) => {
  const [status, setStatus] = useState<CameraStatus>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorType, setErrorType] = useState<'PERMISSION' | 'NOT_FOUND' | 'GENERIC'>('GENERIC');
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isScanLocked, setIsScanLocked] = useState<boolean>(false);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo>({
    status: 'IDLE',
    detectedFormat: 'NONE',
    rawPayload: '',
    fps: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const lastScanTimestamp = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimestamp = useRef<number>(0);
  const hasDetectedRef = useRef<boolean>(false);
  const statusRef = useRef<CameraStatus>('IDLE');

  // Keep statusRef synchronized with state
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Stop camera media tracks cleanly
  const stopCameraStream = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
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
  }, []);

  // Enumerate video devices
  const enumerateCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setAvailableDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch {
      // Ignored
    }
  }, [selectedDeviceId]);

  // Start real browser camera
  const startCamera = useCallback(async (modeOverride?: 'environment' | 'user') => {
    stopCameraStream();
    setStatus('REQUESTING_PERMISSION');
    setErrorMessage('');
    hasDetectedRef.current = false;
    setIsScanLocked(false);

    setDiagnostics((prev) => ({
      ...prev,
      status: 'INITIALIZING',
      rawPayload: '',
      detectedFormat: 'NONE',
    }));

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('ERROR');
      setErrorType('NOT_FOUND');
      setErrorMessage('Camera access is not supported by your current browser environment.');
      return;
    }

    const currentFacing = modeOverride || facingMode;

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : {
              facingMode: { ideal: currentFacing },
              width: { ideal: 1280, min: 640 },
              height: { ideal: 720, min: 480 },
            },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.autoplay = true;
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;

        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().then(() => {
              setStatus('CAMERA_ACTIVE');
              enumerateCameras();
            }).catch(() => {
              setStatus('CAMERA_ACTIVE');
            });
          }
        };
      } else {
        setStatus('CAMERA_ACTIVE');
      }
    } catch (err: any) {
      console.error('[MedVerify CameraScanner] Camera acquisition error:', err);
      stopCameraStream();
      setStatus('ERROR');

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorType('PERMISSION');
        setErrorMessage('Camera access was denied. MedVerify needs camera permission to scan medicine packaging.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorType('NOT_FOUND');
        setErrorMessage('No camera device was detected on your hardware.');
      } else {
        setErrorType('GENERIC');
        setErrorMessage(err.message || 'Unable to initialize optical camera sensor.');
      }
    }
  }, [enumerateCameras, facingMode, selectedDeviceId, stopCameraStream]);

  // Auto-start camera when mounted in Optical Camera mode
  useEffect(() => {
    startCamera();
    return () => {
      stopCameraStream();
    };
  }, []);

  // Real-time detection loop (approx 10 FPS throttled to ensure low CPU usage while feeling instantaneous)
  useEffect(() => {
    const isScanning = status === 'CAMERA_ACTIVE' || status === 'SCANNING';
    if (!isScanning) {
      if (scanLoopRef.current) {
        cancelAnimationFrame(scanLoopRef.current);
        scanLoopRef.current = null;
      }
      return;
    }

    const scanner = getBarcodeScanner();
    lastFpsTimestamp.current = performance.now();
    frameCountRef.current = 0;

    const scanFrame = async (timestamp: number) => {
      if (hasDetectedRef.current || isScanLocked) return;

      // Update diagnostic FPS every 1000ms
      if (timestamp - lastFpsTimestamp.current >= 1000) {
        setDiagnostics((prev) => ({
          ...prev,
          fps: frameCountRef.current,
        }));
        frameCountRef.current = 0;
        lastFpsTimestamp.current = timestamp;
      }

      // Throttle scanning to every 100ms (~10 FPS) for responsive real-time capture
      if (timestamp - lastScanTimestamp.current >= 100) {
        lastScanTimestamp.current = timestamp;
        frameCountRef.current++;

        if (videoRef.current && videoRef.current.readyState >= 2) {
          try {
            // Update status indicator to SCANNING if still active
            if (statusRef.current === 'CAMERA_ACTIVE') {
              setStatus('SCANNING');
            }

            setDiagnostics((prev) => ({
              ...prev,
              status: 'SCANNING',
            }));

            const detected = await scanner.detect(videoRef.current);

            if (detected.length > 0 && detected[0].rawValue && !hasDetectedRef.current) {
              const code = detected[0].rawValue.trim();
              const detectedFmt = detected[0].format || 'BARCODE';

              if (code) {
                // LOCK SCANNER TO PREVENT DUPLICATE BURSTS
                hasDetectedRef.current = true;
                setIsScanLocked(true);

                setStatus('DETECTED');
                setDiagnostics({
                  status: 'CODE DETECTED',
                  detectedFormat: detectedFmt,
                  rawPayload: code,
                  fps: frameCountRef.current,
                });

                // Short visual feedback showing code detected, then decoding, then transition
                setTimeout(() => {
                  setStatus('DECODING');
                  setDiagnostics((prev) => ({
                    ...prev,
                    status: 'DECODING',
                  }));

                  setTimeout(() => {
                    // Stop camera tracks cleanly
                    stopCameraStream();

                    // Transition payload to verification pipeline
                    onCodeDetected(code, detectedFmt);
                  }, 200);
                }, 300);

                return;
              }
            }
          } catch (scanErr) {
            console.debug('[MedVerify Scanner] Frame evaluation tick:', scanErr);
          }
        }
      }

      scanLoopRef.current = requestAnimationFrame(scanFrame);
    };

    scanLoopRef.current = requestAnimationFrame(scanFrame);

    return () => {
      if (scanLoopRef.current) {
        cancelAnimationFrame(scanLoopRef.current);
        scanLoopRef.current = null;
      }
    };
  }, [status, isScanLocked, onCodeDetected, stopCameraStream]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Switch rear/front camera
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const isScanningActive = status === 'CAMERA_ACTIVE' || status === 'SCANNING';
  const isDetected = status === 'DETECTED' || status === 'DECODING';

  return (
    <div className={`camera-scanner-module ${className}`}>
      {/* Viewport Frame */}
      <div
        className={`camera-viewport-card ${isDetected ? 'is-code-detected' : ''}`}
        role="region"
        aria-label="Optical Medicine Scanner Viewport"
      >
        {/* Real Live HTML Video Element */}
        <video
          ref={videoRef}
          className={`camera-video-feed ${isScanningActive || isDetected ? 'is-visible' : 'is-hidden'}`}
          autoPlay
          playsInline
          muted
          aria-hidden={!isScanningActive && !isDetected}
        />

        {/* Optical Viewfinder HUD Overlay */}
        <div className="camera-viewfinder-overlay">
          {/* Corner brackets */}
          <motion.div
            className="viewfinder-brackets"
            animate={
              isDetected
                ? { scale: [1, 1.08, 1], filter: 'drop-shadow(0 0 16px rgba(20, 184, 166, 0.9))' }
                : { scale: 1 }
            }
            transition={{ duration: 0.3 }}
          >
            <span className="bracket bracket--tl" />
            <span className="bracket bracket--tr" />
            <span className="bracket bracket--bl" />
            <span className="bracket bracket--br" />
          </motion.div>

          {/* Animated Scanning Laser Beam - ONLY active while scanning */}
          {isScanningActive && (
            <motion.div
              className="viewfinder-laser-line"
              initial={{ top: '8%', opacity: 0.6 }}
              animate={{
                top: ['8%', '88%', '8%'],
                opacity: [0.6, 1, 0.6],
              }}
              transition={{
                duration: 2.0,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}

          {/* State: IDLE */}
          {status === 'IDLE' && (
            <div className="camera-state-overlay camera-state-overlay--idle">
              <div className="camera-icon-badge">
                <Camera size={38} strokeWidth={1.4} />
              </div>
              <h3 className="camera-state-title">Ready to Scan</h3>
              <p className="camera-state-desc">
                Point camera at the medicine package DataMatrix, 2D QR code, or 1D barcode.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-lg camera-start-cta"
                onClick={() => startCamera()}
              >
                <Camera size={18} />
                <span>Start Camera</span>
              </button>
            </div>
          )}

          {/* State: REQUESTING PERMISSION */}
          {status === 'REQUESTING_PERMISSION' && (
            <div className="camera-state-overlay camera-state-overlay--busy">
              <div className="telemetry-spinner" style={{ width: 36, height: 36 }} />
              <h3 className="camera-state-title" style={{ marginTop: '16px' }}>
                Requesting Camera Access
              </h3>
              <p className="camera-state-desc">
                Please grant camera permissions in your browser prompt to proceed with scanning.
              </p>
            </div>
          )}

          {/* State: CODE DETECTED / DECODING */}
          {isDetected && (
            <div className="camera-state-overlay camera-state-overlay--detected">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="detected-check-mark"
              >
                <CheckCircle2 size={46} />
              </motion.div>
              <h3 className="camera-state-title" style={{ marginTop: '12px' }}>
                {status === 'DETECTED' ? 'Code Detected' : 'Decoding Payload...'}
              </h3>
              <p className="camera-state-desc font-mono" style={{ fontSize: '12px' }}>
                Format: {diagnostics.detectedFormat}
              </p>
            </div>
          )}

          {/* State: ERROR */}
          {status === 'ERROR' && (
            <div className="camera-state-overlay camera-state-overlay--error">
              <div className="camera-error-badge">
                <AlertTriangle size={32} />
              </div>
              <h3 className="camera-state-title">
                {errorType === 'PERMISSION'
                  ? 'Camera Access Required'
                  : errorType === 'NOT_FOUND'
                  ? 'Camera Not Available'
                  : 'Unable to Read Code'}
              </h3>
              <p className="camera-state-desc">{errorMessage}</p>

              <div className="camera-error-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => startCamera()}
                >
                  <RefreshCw size={14} />
                  <span>Try Again</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onSwitchToManual}
                >
                  <Keyboard size={14} />
                  <span>Enter Manually</span>
                </button>
              </div>
            </div>
          )}

          {/* Live HUD Caption when camera is active */}
          {isScanningActive && (
            <div className="camera-active-hud">
              <div className="camera-live-pill">
                <span className="live-dot" />
                <span>{status === 'SCANNING' ? 'SCANNING...' : 'CAMERA ACTIVE'}</span>
              </div>
              <span className="camera-guide-text">
                Align QR, DataMatrix, or barcode inside the frame
              </span>
            </div>
          )}

          {/* Live HUD Caption when detected */}
          {status === 'DETECTED' && (
            <div className="camera-active-hud">
              <div className="camera-live-pill" style={{ backgroundColor: 'rgba(20, 184, 166, 0.25)', borderColor: '#14b8a6' }}>
                <CheckCircle2 size={13} style={{ color: '#2dd4bf' }} />
                <span style={{ color: '#2dd4bf' }}>CODE DETECTED</span>
              </div>
              <span className="camera-guide-text" style={{ color: '#2dd4bf', fontWeight: 600 }}>
                Code detected
              </span>
            </div>
          )}

          {/* Live HUD Caption when decoding */}
          {status === 'DECODING' && (
            <div className="camera-active-hud">
              <div className="camera-live-pill" style={{ backgroundColor: 'rgba(56, 189, 248, 0.25)', borderColor: '#38bdf8' }}>
                <span className="live-dot" style={{ backgroundColor: '#38bdf8' }} />
                <span style={{ color: '#38bdf8' }}>DECODING...</span>
              </div>
              <span className="camera-guide-text" style={{ color: '#38bdf8' }}>
                Extracting GS1 pharmaceutical payload...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Camera Controls Bar */}
      <div className="camera-controls-bar">
        {isScanningActive || isDetected ? (
          <div className="camera-active-controls">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={stopCameraStream}
              aria-label="Stop Camera"
            >
              <CameraOff size={14} />
              <span>Stop Camera</span>
            </button>

            {/* Switch Camera Lens Toggle */}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={toggleFacingMode}
              title="Switch between front and rear camera"
              aria-label="Switch Camera Lens"
            >
              <RefreshCw size={14} />
              <span>Switch Lens ({facingMode === 'environment' ? 'Rear' : 'Front'})</span>
            </button>

            {/* Device Selector for desktop webcams if multiple are found */}
            {availableDevices.length > 1 && (
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  setTimeout(() => startCamera(), 100);
                }}
                className="camera-device-select"
                aria-label="Select camera device"
              >
                {availableDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}

            {/* Diagnostics toggle button */}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.8 }}
              onClick={() => setShowDiagnostics((prev) => !prev)}
              aria-expanded={showDiagnostics}
              aria-label="Toggle Developer Diagnostics"
            >
              <Terminal size={12} style={{ marginRight: 4 }} />
              <span>Developer Diagnostics</span>
              {showDiagnostics ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        ) : (
          <div className="camera-idle-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span className="camera-spec-label">
              Optical Formats: GS1 DataMatrix • 2D QR • EAN-13 • Code-128
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              style={{ fontSize: '11px', opacity: 0.7 }}
              onClick={() => setShowDiagnostics((prev) => !prev)}
              aria-expanded={showDiagnostics}
            >
              <Terminal size={12} style={{ marginRight: 4 }} />
              <span>Diagnostics</span>
            </button>
          </div>
        )}
      </div>

      {/* Developer Diagnostics Area (Exposed for debugging & verifiable decoding feedback) */}
      <AnimatePresence>
        {showDiagnostics && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="camera-diagnostics-panel"
            style={{
              backgroundColor: '#0a0f18',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#94a3b8',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
              overflow: 'hidden',
              marginTop: '10px',
            }}
          >
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>
                Detection Status
              </span>
              <span style={{ color: isDetected ? '#34d399' : isScanningActive ? '#38bdf8' : '#e2e8f0', fontWeight: 600 }}>
                {diagnostics.status}
              </span>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>
                Detected Format
              </span>
              <span style={{ color: '#fcd34d', fontWeight: 600 }}>
                {diagnostics.detectedFormat}
              </span>
            </div>

            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>
                Scan Loop Rate
              </span>
              <span style={{ color: '#a78bfa' }}>
                {isScanningActive ? `${diagnostics.fps} FPS` : 'Idle'}
              </span>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>
                Raw Payload
              </span>
              <span
                style={{
                  color: diagnostics.rawPayload ? '#38bdf8' : '#475569',
                  wordBreak: 'break-all',
                  display: 'block',
                  marginTop: '2px',
                  fontWeight: diagnostics.rawPayload ? 600 : 400,
                }}
              >
                {diagnostics.rawPayload || '(No code detected in current frame)'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accessible aria-live status announcement */}
      <div className="sr-only" aria-live="polite">
        {status === 'IDLE' && 'Camera is ready to scan.'}
        {status === 'REQUESTING_PERMISSION' && 'Requesting camera access permissions.'}
        {status === 'CAMERA_ACTIVE' && 'Camera is active. Align QR, DataMatrix, or barcode in frame.'}
        {status === 'SCANNING' && 'Scanning for medicine barcodes in frame.'}
        {status === 'DETECTED' && 'Packaging code detected. Preparing payload.'}
        {status === 'DECODING' && 'Decoding GS1 barcode payload and contacting registry.'}
        {status === 'ERROR' && `Camera error: ${errorMessage}`}
      </div>
    </div>
  );
};

export default CameraScanner;
