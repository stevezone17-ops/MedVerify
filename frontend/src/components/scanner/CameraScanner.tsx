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
} from 'lucide-react';
import { getBarcodeScanner, DetectedBarcode } from '../../utils/barcodeDetector';

export type CameraStatus =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'CAMERA_ACTIVE'
  | 'SCANNING'
  | 'DETECTED'
  | 'ERROR';

interface CameraScannerProps {
  onCodeDetected: (code: string) => void;
  onSwitchToManual: () => void;
  isVerifying: boolean;
  className?: string;
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const lastScanTimestamp = useRef<number>(0);
  const hasDetectedRef = useRef<boolean>(false);

  // Stop camera media tracks cleanly
  const stopCameraStream = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
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
  const startCamera = useCallback(async () => {
    stopCameraStream();
    setStatus('REQUESTING_PERMISSION');
    setErrorMessage('');
    hasDetectedRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('ERROR');
      setErrorType('NOT_FOUND');
      setErrorMessage('Camera access is not supported by your current browser environment.');
      return;
    }

    try {
      // Video constraints preferring back camera on mobile or selected device
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280, min: 640 },
              height: { ideal: 720, min: 480 },
            },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait until video metadata is loaded before starting scan loop
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

  // Detection loop
  useEffect(() => {
    if (status !== 'CAMERA_ACTIVE' && status !== 'SCANNING') {
      if (scanLoopRef.current) {
        cancelAnimationFrame(scanLoopRef.current);
        scanLoopRef.current = null;
      }
      return;
    }

    const scanner = getBarcodeScanner();

    const scanFrame = async (timestamp: number) => {
      if (hasDetectedRef.current) return;

      // Throttle scanning to every 160ms for CPU efficiency & responsive 6 FPS scan rate
      if (timestamp - lastScanTimestamp.current > 160) {
        lastScanTimestamp.current = timestamp;

        if (videoRef.current && videoRef.current.readyState >= 2) {
          try {
            const detected = await scanner.detect(videoRef.current);

            if (detected.length > 0 && detected[0].rawValue && !hasDetectedRef.current) {
              const code = detected[0].rawValue.trim();
              if (code) {
                hasDetectedRef.current = true;
                setStatus('DETECTED');
                // Stop camera stream immediately to save battery & release device
                stopCameraStream();
                onCodeDetected(code);
                return;
              }
            }
          } catch {
            // Ignore scan evaluation errors for individual frames
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
  }, [status, onCodeDetected, stopCameraStream]);

  // Stop camera when unmounting or when verification finishes
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    if (status === 'CAMERA_ACTIVE' || status === 'SCANNING') {
      setTimeout(startCamera, 100);
    }
  };

  const isScanningActive = status === 'CAMERA_ACTIVE' || status === 'SCANNING';

  return (
    <div className={`camera-scanner-module ${className}`}>
      {/* Viewport Frame */}
      <div className="camera-viewport-card" role="region" aria-label="Optical Medicine Scanner Viewport">
        {/* Real Live HTML Video Element */}
        <video
          ref={videoRef}
          className={`camera-video-feed ${isScanningActive ? 'is-visible' : 'is-hidden'}`}
          autoPlay
          playsInline
          muted
          aria-hidden={!isScanningActive}
        />

        {/* Optical Viewfinder HUD Overlay */}
        <div className="camera-viewfinder-overlay">
          {/* Corner brackets */}
          <div className="viewfinder-brackets">
            <span className="bracket bracket--tl" />
            <span className="bracket bracket--tr" />
            <span className="bracket bracket--bl" />
            <span className="bracket bracket--br" />
          </div>

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
                duration: 2.2,
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
                onClick={startCamera}
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

          {/* State: CODE DETECTED */}
          {status === 'DETECTED' && (
            <div className="camera-state-overlay camera-state-overlay--detected">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="detected-check-mark"
              >
                <CheckCircle2 size={42} />
              </motion.div>
              <h3 className="camera-state-title" style={{ marginTop: '12px' }}>
                Packaging Code Detected
              </h3>
              <p className="camera-state-desc">Extracting payload and contacting registry...</p>
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
                  : 'Optical Sensor Error'}
              </h3>
              <p className="camera-state-desc">{errorMessage}</p>

              <div className="camera-error-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={startCamera}
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
                  <span>Enter Code Manually</span>
                </button>
              </div>
            </div>
          )}

          {/* Live Guide Caption when camera is active */}
          {isScanningActive && (
            <div className="camera-active-hud">
              <div className="camera-live-pill">
                <span className="live-dot" />
                <span>CAMERA ACTIVE</span>
              </div>
              <span className="camera-guide-text">
                Center medicine QR, 2D DataMatrix, or EAN barcode within the frame
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Camera Controls Bar */}
      <div className="camera-controls-bar">
        {isScanningActive ? (
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

            {/* Switch Camera / Facing Mode Toggle */}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={toggleFacingMode}
              title="Switch between front and back camera"
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
                  setTimeout(startCamera, 100);
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
          </div>
        ) : (
          <div className="camera-idle-footer">
            <span className="camera-spec-label">
              Optical Formats: GS1 DataMatrix • 2D QR • EAN-13 • Code-128
            </span>
          </div>
        )}
      </div>

      {/* Accessible aria-live status announcement */}
      <div className="sr-only" aria-live="polite">
        {status === 'IDLE' && 'Camera is ready to scan.'}
        {status === 'REQUESTING_PERMISSION' && 'Requesting camera access permissions.'}
        {status === 'CAMERA_ACTIVE' && 'Camera is active. Align code in frame.'}
        {status === 'DETECTED' && 'Barcode detected. Verifying payload.'}
        {status === 'ERROR' && `Camera error: ${errorMessage}`}
      </div>
    </div>
  );
};

export default CameraScanner;
