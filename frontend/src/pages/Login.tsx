import React, { useState, useRef } from 'react';
import { useNavigate, Link } from '../router';
import {
  Shield,
  Loader2,
  KeyRound,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  QrCode,
  Eye,
  EyeOff,
  ArrowRight,
  Lock,
  Sparkles,
  Check,
} from 'lucide-react';
import { login, register, getStoredUser } from '../api/client';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';

// ---------------------------------------------------------------------------
// Error normalization types & helper
// ---------------------------------------------------------------------------

interface NormalizedError {
  title: string;
  message: string;
}

function normalizeError(err: unknown): NormalizedError {
  // Always log technical error to console for development inspection
  console.error('[MedVerify Auth Debug]', err);

  if (err instanceof Error) {
    const isNet =
      (err as any).isNetworkError ||
      err.name === 'TypeError' ||
      err.message.includes('Failed to fetch') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('NetworkError');

    if (isNet) {
      return {
        title: 'VERIFICATION SERVICE UNAVAILABLE',
        message: 'Verification service is currently unavailable. Please check that the API server is running on port 8001.',
      };
    }

    const status = (err as any).status;
    const msg = (err.message || '').trim();
    const msgLower = msg.toLowerCase();

    // 401 or invalid credentials
    if (
      status === 401 ||
      msgLower.includes('401') ||
      msgLower.includes('invalid') ||
      msgLower.includes('unauthorized') ||
      msgLower.includes('incorrect') ||
      msgLower.includes('credentials')
    ) {
      return {
        title: 'AUTHENTICATION FAILED',
        message: 'Invalid email or password.',
      };
    }

    // 404 on endpoint
    if (status === 404 || msgLower.includes('404') || msgLower.includes('not found')) {
      return {
        title: 'SERVICE UNAVAILABLE',
        message: 'Verification service endpoint not found.',
      };
    }

    // 409 conflict
    if (status === 409 || msgLower.includes('409') || msgLower.includes('already registered')) {
      return {
        title: 'REGISTRATION CONFLICT',
        message: 'An account with this email address already exists.',
      };
    }

    // 422 validation
    if (status === 422 || msgLower.includes('422')) {
      return {
        title: 'AUTHENTICATION FAILED',
        message: msg || 'Please enter a valid work email address and password.',
      };
    }

    // 500 or other server errors
    if (status >= 500 || msgLower.includes('500') || msgLower.includes('internal')) {
      return {
        title: 'AUTHENTICATION ERROR',
        message: 'The verification service returned an unexpected response.',
      };
    }

    return {
      title: 'AUTHENTICATION FAILED',
      message: msg || 'Invalid email or password.',
    };
  }

  return {
    title: 'AUTHENTICATION ERROR',
    message: 'An unexpected error occurred during authentication.',
  };
}

// ---------------------------------------------------------------------------
// Main Login Component
// ---------------------------------------------------------------------------

export default function Login() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const formRef = useRef<HTMLFormElement>(null);

  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorState, setErrorState] = useState<NormalizedError | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';

  // Role routing
  const navigateByRole = () => {
    const user = getStoredUser();
    if (user?.role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/app');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorState(null);
    setStatus('loading');

    // Basic validation
    if (!email.trim() || !password.trim()) {
      setErrorState({
        title: 'AUTHENTICATION FAILED',
        message: 'Please provide both work email and access password.',
      });
      setStatus('error');
      return;
    }

    if (!email.includes('@')) {
      setErrorState({
        title: 'AUTHENTICATION FAILED',
        message: 'Please enter a valid work email address.',
      });
      setStatus('error');
      return;
    }

    try {
      if (isRegister) {
        if (!name.trim()) {
          setErrorState({
            title: 'REGISTRATION ERROR',
            message: 'Please enter your full name.',
          });
          setStatus('error');
          return;
        }
        await register(name, email, password);
      } else {
        await login(email, password);
      }

      setStatus('success');
      // Hold success animation briefly before routing
      setTimeout(navigateByRole, 750);
    } catch (err: unknown) {
      const normalized = normalizeError(err);
      setErrorState(normalized);
      setStatus('error');
    }
  };

  const handleFillDemo = (role: 'admin' | 'user') => {
    if (role === 'admin') {
      setEmail('admin@medverify.demo');
      setPassword('admin123');
    } else {
      setEmail('user@medverify.demo');
      setPassword('user123');
    }
    setErrorState(null);
    setStatus('idle');
  };

  // -------------------------------------------------------------------------
  // Framer Motion Variants (Part D)
  // -------------------------------------------------------------------------

  const leftBgVariants: Variants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: { duration: shouldReduceMotion ? 0.2 : 0.8, ease: 'easeOut' },
    },
  };

  const logoVariants: Variants = {
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : -10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { delay: 0.15, duration: 0.5, ease: 'easeOut' },
    },
  };

  const headlineVariants: Variants = {
    initial: { opacity: 0, x: shouldReduceMotion ? 0 : -30 },
    animate: {
      opacity: 1,
      x: 0,
      transition: { delay: 0.3, duration: 0.6, ease: 'easeOut' },
    },
  };

  const descVariants: Variants = {
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 12 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { delay: 0.45, duration: 0.5, ease: 'easeOut' },
    },
  };

  const visualVariants: Variants = {
    initial: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.96 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: { delay: 0.6, duration: 0.6, ease: 'easeOut' },
    },
  };

  const rightPanelVariants: Variants = {
    initial: { opacity: 0, x: shouldReduceMotion ? 0 : 30 },
    animate: {
      opacity: 1,
      x: 0,
      transition: { delay: 0.75, duration: 0.6, ease: 'easeOut' },
    },
  };

  const headingVariants: Variants = {
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { delay: 0.9, duration: 0.45, ease: 'easeOut' },
    },
  };

  const formStaggerVariants: Variants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        delayChildren: 1.0,
        staggerChildren: 0.08,
      },
    },
  };

  const formItemVariants: Variants = {
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: 'easeOut' },
    },
  };

  const demoVariants: Variants = {
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 12 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { delay: 1.15, duration: 0.5, ease: 'easeOut' },
    },
  };

  // Subtle horizontal shake on error
  const shakeVariants: Variants = {
    initial: { x: 0 },
    shake: {
      x: shouldReduceMotion ? 0 : [0, -4, 4, -3, 3, 0],
      transition: { duration: 0.32, ease: 'easeInOut' },
    },
  };

  return (
    <div className="medverify-login-wrapper">
      {/* ================================================================
          PART B: LEFT VISUAL PANEL (45% split, never collapses)
          ================================================================ */}
      <motion.div
        className="medverify-left-panel"
        variants={leftBgVariants}
        initial="initial"
        animate="animate"
      >
        {/* Dark pharmaceutical backdrop overlay with radial accents */}
        <div className="left-panel-gradient-overlay" />
        <div className="left-panel-grid-lines" />

        {/* Floating Card 1: Registry Match (subtle floating y: 0 -> -6 -> 0) */}
        <motion.div
          className="floating-data-card card-top-right"
          animate={
            shouldReduceMotion
              ? {}
              : {
                  y: [0, -6, 0],
                  transition: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
                }
          }
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.85, duration: 0.5 }}
        >
          <div className="floating-card-icon emerald">
            <Check size={14} strokeWidth={3} />
          </div>
          <div className="floating-card-body">
            <span className="floating-card-title verified">✓ REGISTRY MATCH</span>
            <span className="floating-card-sub">Product identifier verified</span>
          </div>
        </motion.div>

        {/* Floating Card 2: 96% Match Confidence */}
        <motion.div
          className="floating-data-card card-bottom-flank"
          animate={
            shouldReduceMotion
              ? {}
              : {
                  y: [0, -5, 0],
                  transition: { duration: 5.6, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
                }
          }
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.05, duration: 0.5 }}
        >
          <div className="floating-card-stat">96%</div>
          <div className="floating-card-body">
            <span className="floating-card-title">MATCH CONFIDENCE</span>
            <span className="floating-card-sub">GS1 / Batch validated</span>
          </div>
        </motion.div>

        {/* Top Branding (0.15s) */}
        <motion.div className="left-brand-row" variants={logoVariants}>
          <Link to="/" className="brand-lockup-link">
            <div className="left-brand-shield">
              <Shield size={20} strokeWidth={2.4} />
              <span className="shield-dot" />
            </div>
            <div className="left-brand-text">
              <span className="brand-name">MEDVERIFY</span>
              <span className="brand-tagline">DIGITAL MEDICINE VERIFICATION</span>
            </div>
          </Link>
        </motion.div>

        {/* Middle: Editorial Typography + Description */}
        <div className="left-editorial-container">
          <motion.h1 className="left-editorial-heading" variants={headlineVariants}>
            TRUST WHAT
            <br />
            YOU <span className="highlight-emerald">VERIFY.</span>
          </motion.h1>

          <motion.p className="left-editorial-desc" variants={descVariants}>
            Digital verification for medicine identity, packaging and product information.
          </motion.p>

          {/* Verification Visualization Diagram (0.60s) */}
          <motion.div className="verification-diagram-box" variants={visualVariants}>
            {/* Box 1: Medicine Package */}
            <div className="diagram-package-specimen">
              <div className="specimen-header">
                <span className="specimen-label">MEDICINE PACKAGE</span>
                <span className="specimen-live-pill">SCANNING</span>
              </div>
              <div className="specimen-body">
                <div className="specimen-art">
                  <div className="specimen-box-frame">
                    <span className="specimen-brand">MEDVERIFY</span>
                    <div className="specimen-qr-matrix">
                      <QrCode size={26} />
                      <div className="specimen-scan-laser" />
                    </div>
                    <span className="specimen-code">89012345678901</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Connecting flow line 1 */}
            <div className="diagram-connector">
              <div className="diagram-line" />
              <div className="diagram-arrow-down" />
            </div>

            {/* Step 2: QR Detected */}
            <div className="diagram-step-pill">
              <div className="step-pip-pulse" />
              <span className="step-text">QR DETECTED</span>
              <span className="step-detail">GTIN-14 FORMAT</span>
            </div>

            {/* Connecting flow line 2 */}
            <div className="diagram-connector">
              <div className="diagram-line" />
              <div className="diagram-arrow-down" />
            </div>

            {/* Step 3: Verified Badge */}
            <div className="diagram-verified-banner">
              <div className="verified-check-bubble">
                <Check size={14} strokeWidth={3} />
              </div>
              <div className="verified-banner-text">
                <span className="verified-status">✓ VERIFIED</span>
                <span className="verified-meta">SECURE AUDIT RECORD #7802</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer Meta */}
        <div className="left-panel-footer">
          <span>HIGH-PRECISION PHARMACEUTICAL SCREENING</span>
          <span>·</span>
          <span>ENTERPRISE LEDGER</span>
        </div>
      </motion.div>

      {/* ================================================================
          PART C: RIGHT AUTHENTICATION PANEL (55% split, max 520px)
          ================================================================ */}
      <motion.div
        className="medverify-right-panel"
        variants={rightPanelVariants}
        initial="initial"
        animate="animate"
      >
        <div className="auth-content-box">
          {/* Mobile Header Branding (visible only on mobile) */}
          <div className="mobile-brand-bar">
            <Link to="/" className="mobile-brand-link">
              <div className="left-brand-shield small">
                <Shield size={16} strokeWidth={2.4} />
              </div>
              <div>
                <span className="mobile-brand-title">MEDVERIFY</span>
                <span className="mobile-brand-sub">VERIFICATION CONSOLE</span>
              </div>
            </Link>
          </div>

          {/* Login Header (0.90s) */}
          <motion.div className="auth-header-block" variants={headingVariants}>
            <div className="auth-eyebrow-tag">
              <Sparkles size={12} className="tag-icon" />
              <span>SECURE WORKSPACE ACCESS</span>
            </div>
            <h2 className="auth-title">
              {isRegister ? 'CREATE ACCOUNT.' : 'WELCOME BACK.'}
            </h2>
            <p className="auth-subtitle">
              {isRegister
                ? 'Register your organizational credentials for the MedVerify console.'
                : 'Sign in to the MedVerify verification console.'}
            </p>
          </motion.div>

          {/* Form & Error Area (1.00s) */}
          <motion.form
            ref={formRef}
            onSubmit={handleSubmit}
            className="auth-form"
            variants={formStaggerVariants}
            initial="initial"
            animate="animate"
          >
            {/* Error Notification with Horizontal Shake */}
            <AnimatePresence mode="wait">
              {status === 'error' && errorState && (
                <motion.div
                  key="auth-error-alert"
                  className="auth-error-banner"
                  role="alert"
                  aria-live="assertive"
                  variants={shakeVariants}
                  initial="initial"
                  animate="shake"
                  exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
                >
                  <div className="error-icon-box">
                    <AlertCircle size={18} />
                  </div>
                  <div className="error-copy">
                    <strong className="error-title">{errorState.title}</strong>
                    <p className="error-message">{errorState.message}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Optional Registration Name Field */}
            {isRegister && (
              <motion.div className="form-group" variants={formItemVariants}>
                <label htmlFor="auth-name" className="form-label">
                  FULL NAME
                </label>
                <input
                  id="auth-name"
                  type="text"
                  placeholder="Dr. Eleanor Vance"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="form-input"
                  required
                />
              </motion.div>
            )}

            {/* Work Email */}
            <motion.div className="form-group" variants={formItemVariants}>
              <label htmlFor="auth-email" className="form-label">
                WORK EMAIL
              </label>
              <input
                id="auth-email"
                type="email"
                placeholder="operator@medverify.demo"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') {
                    setStatus('idle');
                    setErrorState(null);
                  }
                }}
                autoComplete="email"
                className="form-input"
                required
                autoFocus
              />
            </motion.div>

            {/* Access Password */}
            <motion.div className="form-group" variants={formItemVariants}>
              <div className="label-row">
                <label htmlFor="auth-password" className="form-label">
                  ACCESS PASSWORD
                </label>
              </div>
              <div className="password-input-wrapper">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (status === 'error') {
                      setStatus('idle');
                      setErrorState(null);
                    }
                  }}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className="form-input password-input"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="password-toggle-btn"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </motion.div>

            {/* Submit Button with Framer Motion hover/tap & states */}
            <motion.div variants={formItemVariants}>
              <motion.button
                type="submit"
                id="authenticate-submit-button"
                disabled={isLoading || isSuccess}
                whileHover={isLoading || isSuccess ? {} : { translateY: -2 }}
                whileTap={isLoading || isSuccess ? {} : { scale: 0.98 }}
                className={`auth-submit-btn ${isSuccess ? 'btn-success' : ''} ${isLoading ? 'btn-loading' : ''}`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isLoading ? (
                    <motion.span
                      key="loading"
                      className="btn-content-inner"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Loader2 size={16} className="btn-spinner" />
                      <span>AUTHENTICATING...</span>
                    </motion.span>
                  ) : isSuccess ? (
                    <motion.span
                      key="success"
                      className="btn-content-inner"
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CheckCircle2 size={16} />
                      <span>IDENTITY VERIFIED</span>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="normal"
                      className="btn-content-inner"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Lock size={15} />
                      <span>{isRegister ? 'CREATE ACCOUNT & ENTER' : 'AUTHENTICATE & ENTER'}</span>
                      <ArrowRight size={15} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.div>
          </motion.form>

          {/* Demo Access Section (1.15s) */}
          <motion.div className="demo-access-block" variants={demoVariants}>
            <div className="demo-header-line">
              <span className="demo-header-text">DEMO ACCESS</span>
              <span className="demo-sub-text">Click to autofill credentials</span>
            </div>

            <div className="demo-cards-grid">
              {/* ADMIN Card */}
              <motion.button
                type="button"
                id="demo-admin-button"
                onClick={() => handleFillDemo('admin')}
                whileHover={{ translateY: -2 }}
                whileTap={{ scale: 0.98 }}
                className="demo-card admin-card"
              >
                <div className="demo-card-top">
                  <div className="demo-icon-pill admin-pill">
                    <KeyRound size={13} />
                  </div>
                  <span className="demo-role-name">ADMIN</span>
                </div>
                <div className="demo-card-desc">
                  Registry + Analytics + Audit
                </div>
                <div className="demo-card-email">admin@medverify.demo</div>
              </motion.button>

              {/* USER Card */}
              <motion.button
                type="button"
                id="demo-user-button"
                onClick={() => handleFillDemo('user')}
                whileHover={{ translateY: -2 }}
                whileTap={{ scale: 0.98 }}
                className="demo-card user-card"
              >
                <div className="demo-card-top">
                  <div className="demo-icon-pill user-pill">
                    <UserCheck size={13} />
                  </div>
                  <span className="demo-role-name">USER</span>
                </div>
                <div className="demo-card-desc">
                  Verification + History
                </div>
                <div className="demo-card-email">user@medverify.demo</div>
              </motion.button>
            </div>
          </motion.div>

          {/* Toggle between Login and Registration */}
          <div className="auth-footer-links">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setErrorState(null);
                setStatus('idle');
              }}
              className="toggle-register-btn"
            >
              {isRegister
                ? 'Already have an authorized account? Sign in here'
                : 'Need a new operator account? Request registration'}
            </button>

            <Link to="/" className="back-portal-link">
              ← Return to MedVerify Public Verification Portal
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ================================================================
          RESPONSIVE & DEDICATED STYLING
          ================================================================ */}
      <style>{`
        /* Root container layout */
        .medverify-login-wrapper {
          display: grid;
          grid-template-columns: 45% 55%;
          min-height: 100vh;
          width: 100vw;
          background-color: #ffffff;
          overflow-x: hidden;
          font-family: var(--font-sans);
          box-sizing: border-box;
        }

        /* Tablet composition: 40% visual / 60% auth */
        @media (max-width: 1024px) and (min-width: 768px) {
          .medverify-login-wrapper {
            grid-template-columns: 40% 60%;
          }
        }

        /* Mobile composition: 240-280px visual on top, then form */
        @media (max-width: 767px) {
          .medverify-login-wrapper {
            display: flex;
            flex-direction: column;
            grid-template-columns: none;
          }
        }

        /* ================================================================
           LEFT PANEL STYLES
           ================================================================ */
        .medverify-left-panel {
          position: relative;
          min-height: 100vh;
          width: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px 44px;
          background-image:
            linear-gradient(165deg, rgba(8, 14, 24, 0.90) 0%, rgba(13, 26, 38, 0.85) 45%, rgba(6, 44, 34, 0.92) 100%),
            url('/hero-bg.jpg');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          color: #ffffff;
          overflow: hidden;
          box-sizing: border-box;
        }

        @media (max-width: 767px) {
          .medverify-left-panel {
            min-height: 240px;
            max-height: 290px;
            padding: 24px 20px;
            justify-content: center;
          }
        }

        .left-panel-gradient-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at 15% 20%, rgba(45, 212, 191, 0.12) 0%, transparent 50%),
                      radial-gradient(circle at 85% 80%, rgba(13, 148, 136, 0.16) 0%, transparent 60%);
          z-index: 1;
        }

        .left-panel-grid-lines {
          position: absolute;
          inset: 0;
          background-size: 32px 32px;
          background-image: linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          pointer-events: none;
          z-index: 1;
        }

        /* Floating data cards */
        .floating-data-card {
          position: absolute;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 12px 30px -6px rgba(0, 0, 0, 0.45);
          z-index: 10;
          pointer-events: none;
        }

        .card-top-right {
          top: 36px;
          right: 32px;
        }

        .card-bottom-flank {
          bottom: 74px;
          right: 36px;
        }

        @media (max-width: 900px) {
          .floating-data-card {
            display: none !important;
          }
        }

        .floating-card-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .floating-card-icon.emerald {
          background: #059669;
          color: #ffffff;
        }

        .floating-card-stat {
          font-family: var(--font-mono);
          font-size: 16px;
          font-weight: 850;
          color: #2dd4bf;
          letter-spacing: -0.02em;
        }

        .floating-card-body {
          display: flex;
          flex-direction: column;
        }

        .floating-card-title {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #f1f5f9;
        }

        .floating-card-title.verified {
          color: #34d399;
        }

        .floating-card-sub {
          font-size: 9px;
          color: #94a3b8;
        }

        /* Branding top */
        .left-brand-row {
          position: relative;
          z-index: 4;
        }

        .brand-lockup-link {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
        }

        .left-brand-shield {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: linear-gradient(135deg, #0d9488 0%, #115e59 100%);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          box-shadow: 0 4px 14px rgba(13, 148, 136, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .left-brand-shield.small {
          width: 30px;
          height: 30px;
          border-radius: 8px;
        }

        .shield-dot {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #2dd4bf;
          top: 7px;
          right: 7px;
          box-shadow: 0 0 6px #2dd4bf;
        }

        .left-brand-text {
          display: flex;
          flex-direction: column;
        }

        .brand-name {
          font-size: 15px;
          font-weight: 850;
          color: #ffffff;
          letter-spacing: -0.01em;
          line-height: 1.1;
        }

        .brand-tagline {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.55);
          margin-top: 2px;
        }

        /* Middle editorial */
        .left-editorial-container {
          position: relative;
          z-index: 4;
          margin-top: auto;
          margin-bottom: auto;
          padding: 24px 0;
          max-width: 480px;
        }

        @media (max-width: 767px) {
          .left-editorial-container {
            margin: 0;
            padding: 0;
            max-width: 100%;
          }
        }

        .left-editorial-heading {
          font-size: clamp(2rem, 3.2vw, 3rem);
          font-weight: 850;
          letter-spacing: -0.035em;
          line-height: 1.05;
          color: #ffffff;
          margin: 0 0 16px 0;
        }

        @media (max-width: 767px) {
          .left-editorial-heading {
            font-size: 1.75rem;
            margin-bottom: 8px;
          }
        }

        .highlight-emerald {
          color: #2dd4bf;
        }

        .left-editorial-desc {
          font-size: 14px;
          line-height: 1.55;
          color: rgba(241, 245, 249, 0.82);
          margin: 0 0 28px 0;
        }

        @media (max-width: 767px) {
          .left-editorial-desc {
            font-size: 12px;
            margin-bottom: 0;
          }
        }

        /* Verification Visualization Box */
        .verification-diagram-box {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 380px;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 16px 20px;
          box-shadow: 0 16px 36px -10px rgba(0, 0, 0, 0.5);
        }

        @media (max-width: 767px) {
          .verification-diagram-box {
            display: none !important;
          }
        }

        .diagram-package-specimen {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 10px;
          padding: 10px 14px;
        }

        .specimen-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .specimen-label {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.6);
        }

        .specimen-live-pill {
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.08em;
          background: rgba(45, 212, 191, 0.15);
          color: #2dd4bf;
          border: 1px solid rgba(45, 212, 191, 0.35);
          padding: 2px 6px;
          border-radius: 999px;
        }

        .specimen-art {
          display: flex;
          justify-content: center;
        }

        .specimen-box-frame {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: rgba(2, 6, 23, 0.6);
          border: 1px dashed rgba(45, 212, 191, 0.3);
          border-radius: 8px;
          padding: 6px 12px;
        }

        .specimen-brand {
          font-size: 10px;
          font-weight: 850;
          color: #ffffff;
          letter-spacing: 0.05em;
        }

        .specimen-qr-matrix {
          position: relative;
          color: #2dd4bf;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 2px;
        }

        .specimen-scan-laser {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #34d399;
          box-shadow: 0 0 6px #34d399;
          animation: scanSweep 2s ease-in-out infinite alternate;
        }

        @keyframes scanSweep {
          0% { transform: translateY(0px); opacity: 0.8; }
          100% { transform: translateY(24px); opacity: 1; }
        }

        .specimen-code {
          font-family: var(--font-mono);
          font-size: 10px;
          color: rgba(255, 255, 255, 0.7);
        }

        .diagram-connector {
          display: flex;
          flex-direction: column;
          align-items: center;
          height: 18px;
          justify-content: center;
        }

        .diagram-line {
          width: 1px;
          height: 12px;
          background: rgba(45, 212, 191, 0.4);
        }

        .diagram-arrow-down {
          width: 0;
          height: 0;
          border-left: 3px solid transparent;
          border-right: 3px solid transparent;
          border-top: 4px solid #2dd4bf;
        }

        .diagram-step-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(13, 148, 136, 0.2);
          border: 1px solid rgba(45, 212, 191, 0.35);
          border-radius: 999px;
          padding: 4px 14px;
        }

        .step-pip-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #2dd4bf;
          box-shadow: 0 0 6px #2dd4bf;
        }

        .step-text {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #ffffff;
        }

        .step-detail {
          font-family: var(--font-mono);
          font-size: 9px;
          color: rgba(255, 255, 255, 0.6);
        }

        .diagram-verified-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          background: rgba(6, 95, 70, 0.35);
          border: 1px solid rgba(16, 185, 129, 0.5);
          border-radius: 8px;
          padding: 8px 12px;
        }

        .verified-check-bubble {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #10b981;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .verified-banner-text {
          display: flex;
          flex-direction: column;
        }

        .verified-status {
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.06em;
          color: #34d399;
        }

        .verified-meta {
          font-family: var(--font-mono);
          font-size: 9px;
          color: rgba(255, 255, 255, 0.65);
        }

        .left-panel-footer {
          position: relative;
          z-index: 4;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.4);
        }

        @media (max-width: 767px) {
          .left-panel-footer {
            display: none !important;
          }
        }

        /* ================================================================
           RIGHT PANEL STYLES
           ================================================================ */
        .medverify-right-panel {
          position: relative;
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          background: #ffffff;
          box-sizing: border-box;
        }

        @media (max-width: 767px) {
          .medverify-right-panel {
            min-height: auto;
            padding: 32px 18px 48px 18px;
          }
        }

        .auth-content-box {
          width: 100%;
          max-width: 520px;
          box-sizing: border-box;
        }

        /* Mobile brand bar */
        .mobile-brand-bar {
          display: none;
          margin-bottom: 24px;
        }

        @media (max-width: 767px) {
          .mobile-brand-bar {
            display: flex;
          }
        }

        .mobile-brand-link {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
        }

        .mobile-brand-title {
          display: block;
          font-size: 13px;
          font-weight: 850;
          color: #0f172a;
          letter-spacing: -0.01em;
        }

        .mobile-brand-sub {
          display: block;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #64748b;
        }

        /* Header */
        .auth-header-block {
          margin-bottom: 32px;
        }

        .auth-eyebrow-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          background: var(--color-brand-50, #f0fdf9);
          border: 1px solid var(--color-brand-200, #99f6df);
          border-radius: 999px;
          color: var(--color-brand-800, #115e59);
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        .tag-icon {
          color: var(--color-brand-600, #0d9488);
        }

        .auth-title {
          font-size: clamp(34px, 3.4vw, 48px);
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #090d16;
          line-height: 1.08;
          margin: 0 0 10px 0;
        }

        .auth-subtitle {
          font-size: 14px;
          color: #64748b;
          line-height: 1.5;
          margin: 0;
        }

        /* Form styling */
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .form-label {
          font-size: 11px;
          font-weight: 750;
          letter-spacing: 0.08em;
          color: #475569;
          text-transform: uppercase;
        }

        .form-input {
          width: 100%;
          height: 48px;
          padding: 0 14px;
          font-size: 14px;
          font-family: var(--font-sans);
          color: #0f172a;
          background-color: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
          box-sizing: border-box;
        }

        .form-input:focus {
          background-color: #ffffff;
          border-color: #0d9488;
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15);
        }

        .password-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .password-input {
          padding-right: 46px;
        }

        .password-toggle-btn {
          position: absolute;
          right: 10px;
          background: none;
          border: none;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          cursor: pointer;
          border-radius: 6px;
          transition: color 0.15s;
        }

        .password-toggle-btn:hover {
          color: #334155;
        }

        /* Error alert banner */
        .auth-error-banner {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 10px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          box-sizing: border-box;
        }

        .error-icon-box {
          flex-shrink: 0;
          color: #dc2626;
          margin-top: 1px;
        }

        .error-copy {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .error-title {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .error-message {
          font-size: 12px;
          line-height: 1.45;
          margin: 0;
          color: #b91c1c;
        }

        /* Submit Button */
        .auth-submit-btn {
          width: 100%;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
          color: #ffffff;
          font-size: 13px;
          font-weight: 750;
          letter-spacing: 0.04em;
          border: 1px solid rgba(255, 255, 255, 0.15);
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35);
          transition: background 0.2s, box-shadow 0.2s, opacity 0.2s;
        }

        .auth-submit-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #0f766e 0%, #115e59 100%);
          box-shadow: 0 6px 18px rgba(13, 148, 136, 0.45);
        }

        .auth-submit-btn:disabled {
          cursor: not-allowed;
          opacity: 0.9;
        }

        .auth-submit-btn.btn-loading {
          background: #0f766e;
        }

        .auth-submit-btn.btn-success {
          background: #059669;
          box-shadow: 0 4px 14px rgba(5, 150, 105, 0.4);
        }

        .btn-content-inner {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        .btn-spinner {
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Demo Access block */
        .demo-access-block {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e2e8f0;
        }

        .demo-header-line {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 12px;
        }

        .demo-header-text {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #64748b;
          text-transform: uppercase;
        }

        .demo-sub-text {
          font-size: 10px;
          color: #94a3b8;
        }

        .demo-cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        @media (max-width: 480px) {
          .demo-cards-grid {
            grid-template-columns: 1fr;
          }
        }

        .demo-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          padding: 12px 14px;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          text-align: left;
          transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }

        .demo-card:hover {
          background: #ffffff;
          border-color: #0d9488;
          box-shadow: 0 4px 12px rgba(13, 148, 136, 0.08);
        }

        .demo-card-top {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
        }

        .demo-icon-pill {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .demo-icon-pill.admin-pill {
          background: #f0fdf9;
          color: #0d9488;
          border: 1px solid #ccfbef;
        }

        .demo-icon-pill.user-pill {
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #dbeafe;
        }

        .demo-role-name {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #0f172a;
        }

        .demo-card-desc {
          font-size: 11px;
          color: #64748b;
          line-height: 1.35;
        }

        .demo-card-email {
          font-family: var(--font-mono);
          font-size: 10px;
          color: #94a3b8;
          margin-top: 2px;
        }

        /* Footer toggles */
        .auth-footer-links {
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .toggle-register-btn {
          background: none;
          border: none;
          font-size: 12px;
          color: #475569;
          font-weight: 600;
          cursor: pointer;
          transition: color 0.15s;
        }

        .toggle-register-btn:hover {
          color: #0d9488;
        }

        .back-portal-link {
          font-size: 11px;
          color: #94a3b8;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.15s;
        }

        .back-portal-link:hover {
          color: #0f172a;
        }
      `}</style>
    </div>
  );
}
