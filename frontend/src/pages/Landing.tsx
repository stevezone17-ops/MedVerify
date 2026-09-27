import { useState, useRef, useEffect } from 'react';
import { Link } from '../router';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  AnimatePresence,
  type Variants,
} from 'framer-motion';
import {
  Shield,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  Database,
  Lock,
  FileCheck,
  QrCode,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { pageVariants, transitions } from '../animations/motion';
import AnimatedMetric from '../components/ui/AnimatedMetric';

// ---------------------------------------------------------------------------
// Animation Variants
// ---------------------------------------------------------------------------

const heroContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.14,
      delayChildren: 0.1,
    },
  },
};

const headlineLineVariants: Variants = {
  hidden: { y: '100%', opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] },
  },
};

const heroFadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
  },
};

const panelEntrance: Variants = {
  hidden: { opacity: 0, x: 36, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.85, delay: 0.75, ease: [0.16, 1, 0.3, 1] },
  },
};

const checkItemVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: 1.1 + i * 0.15,
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

const resultBannerVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: 1.8, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

const processBarVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, delay: 1.25, ease: [0.16, 1, 0.3, 1] },
  },
};

const scrollGroupVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

const stageContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const stageCardVariants: Variants = {
  hidden: { opacity: 0, y: 36, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
  },
};

const decisionContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

const decisionCardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
  },
};

// ---------------------------------------------------------------------------
// Animated Confidence Score Helper
// ---------------------------------------------------------------------------

function AnimatedHeroScore({ targetScore, delay = 1800 }: { targetScore: number; delay?: number }) {
  const [score, setScore] = useState<number>(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) {
      setScore(targetScore);
      return;
    }
    const timeout = setTimeout(() => {
      let startTime: number | null = null;
      const duration = 1000;
      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        setScore(Math.round(targetScore * ease));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);

    return () => clearTimeout(timeout);
  }, [targetScore, delay, shouldReduceMotion]);

  return <span className="tabular-nums font-mono">{score}% MATCH</span>;
}

function AnimatedShowcaseScore({ score, status }: { score: number; status: string }) {
  const [currentScore, setCurrentScore] = useState<number>(score);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) {
      setCurrentScore(score);
      return;
    }
    const start = currentScore;
    const end = score;
    let startTime: number | null = null;
    const duration = 700;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCurrentScore(Math.round(start + (end - start) * ease));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [score, shouldReduceMotion]);

  const color =
    status === 'VERIFIED'
      ? '#047857'
      : status === 'REVIEW'
      ? '#b45309'
      : '#dc2626';

  return (
    <span
      className="tabular-nums font-mono"
      style={{
        fontSize: 'var(--text-xl)',
        fontWeight: 850,
        color,
        transition: 'color 0.4s ease',
      }}
    >
      {currentScore}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Showcase Specimen Presets
// ---------------------------------------------------------------------------

interface ShowcaseSpecimen {
  id: string;
  name: string;
  dosage: string;
  batch: string;
  mfr: string;
  status: 'VERIFIED' | 'REVIEW' | 'SUSPICIOUS';
  score: number;
  badgeCls: string;
  description: string;
  checks: { name: string; score: string; pass: boolean | 'warn' }[];
}

const SHOWCASE_SPECIMENS: ShowcaseSpecimen[] = [
  {
    id: 'specimen-1',
    name: 'Amoxicillin Trihydrate',
    dosage: '500 mg Capsules',
    batch: 'BATCH-2026-001',
    mfr: 'PharmaCore Laboratories Inc.',
    status: 'VERIFIED',
    score: 96,
    badgeCls: 'verified',
    description: 'All 6 forensic parameters match the certified manufacturer registry. Zero supply chain anomalies detected.',
    checks: [
      { name: 'Product Identifier (GTIN-14)', score: '30 / 30', pass: true },
      { name: 'Manufacturer Authorization', score: '20 / 20', pass: true },
      { name: 'Active Batch Integrity', score: '20 / 20', pass: true },
      { name: 'Expiry Date Validity', score: '15 / 15', pass: true },
      { name: 'Serial Nonce Uniqueness', score: '10 / 10', pass: true },
      { name: 'Packaging Cryptographic Checksum', score: '1 / 5', pass: 'warn' },
    ],
  },
  {
    id: 'specimen-2',
    name: 'Atorvastatin Calcium',
    dosage: '20 mg Film-Coated Tablets',
    batch: 'BATCH-2026-999',
    mfr: 'GlobalRx Pharmaceuticals',
    status: 'REVIEW',
    score: 58,
    badgeCls: 'review',
    description: 'Product identifier and manufacturer are authentic, but the scanned batch does not correlate with known production records.',
    checks: [
      { name: 'Product Identifier (GTIN-14)', score: '30 / 30', pass: true },
      { name: 'Manufacturer Authorization', score: '20 / 20', pass: true },
      { name: 'Active Batch Integrity', score: '0 / 20 (Mismatch)', pass: false },
      { name: 'Expiry Date Validity', score: '8 / 15 (Near Expiry)', pass: 'warn' },
      { name: 'Serial Nonce Uniqueness', score: '0 / 10 (Unverified)', pass: false },
      { name: 'Packaging Cryptographic Checksum', score: '0 / 5', pass: false },
    ],
  },
  {
    id: 'specimen-3',
    name: 'Azithromycin Monohydrate',
    dosage: '250 mg Tablets',
    batch: 'BATCH-FAKE-X7',
    mfr: 'Unknown / Unlicensed Entity',
    status: 'SUSPICIOUS',
    score: 35,
    badgeCls: 'suspicious',
    description: 'High-risk counterfeit signature: duplicated serial number and unregistered manufacturer license. Immediate quarantine required.',
    checks: [
      { name: 'Product Identifier (GTIN-14)', score: '25 / 30', pass: 'warn' },
      { name: 'Manufacturer Authorization', score: '0 / 20 (Unlicensed)', pass: false },
      { name: 'Active Batch Integrity', score: '0 / 20 (Fabricated)', pass: false },
      { name: 'Expiry Date Validity', score: '10 / 15', pass: true },
      { name: 'Serial Nonce Uniqueness', score: '0 / 10 (Cloned Nonce)', pass: false },
      { name: 'Packaging Cryptographic Checksum', score: '0 / 5', pass: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main Landing Page Component
// ---------------------------------------------------------------------------

export default function Landing() {
  const shouldReduceMotion = useReducedMotion();
  const [activeSpecimenId, setActiveSpecimenId] = useState<string>('specimen-1');
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [hoveredProcessIndex, setHoveredProcessIndex] = useState<number | null>(null);

  // Scroll Parallax for Hero
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  const heroImageScale = useTransform(
    heroScrollProgress,
    [0, 1],
    shouldReduceMotion ? [1, 1] : [1, 1.06]
  );
  const heroContentY = useTransform(
    heroScrollProgress,
    [0, 1],
    shouldReduceMotion ? [0, 0] : [0, -28]
  );
  const verificationPanelY = useTransform(
    heroScrollProgress,
    [0, 1],
    shouldReduceMotion ? [0, 0] : [0, -14]
  );

  const activeSpecimen =
    SHOWCASE_SPECIMENS.find((s) => s.id === activeSpecimenId) || SHOWCASE_SPECIMENS[0];

  const navLinks = [
    { to: '/app/scanner', label: 'Verify' },
    { href: '#how-it-works', label: 'How It Works' },
    { to: '/app/registry', label: 'Registry' },
    { to: '/app/history', label: 'History' },
    { to: '/about', label: 'About' },
  ];

  return (
    <motion.div
      className="cinematic-landing"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* ----------------------------------------------------------------
          1. CLEAN WHITE NAVIGATION BAR WITH SLIDING HOVER INDICATOR
          ---------------------------------------------------------------- */}
      <motion.header
        className="cinematic-nav"
        role="banner"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="cinematic-nav__inner">
          <Link
            to="/"
            className="cinematic-nav__brand"
            aria-label="MedVerify Home"
          >
            <div className="brand-mark" style={{ width: 38, height: 38 }}>
              <Shield size={20} strokeWidth={2.4} />
              <span className="brand-dot" />
            </div>
            <div className="brand-text">
              <span
                className="brand-name"
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 850,
                  color: 'var(--color-navy-950)',
                  letterSpacing: '-0.02em',
                }}
              >
                MEDVERIFY
              </span>
              <span
                className="brand-sub"
                style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--color-slate-500)',
                }}
              >
                DIGITAL MEDICINE VERIFICATION
              </span>
            </div>
          </Link>

          <nav className="cinematic-nav__links" aria-label="Main Navigation">
            {navLinks.map((item) => (
              <div
                key={item.label}
                className="cinematic-nav__link-wrap"
                onMouseEnter={() => setHoveredNav(item.label)}
                onMouseLeave={() => setHoveredNav(null)}
              >
                {item.to ? (
                  <Link to={item.to} className="cinematic-nav__link">
                    {item.label}
                  </Link>
                ) : (
                  <a href={item.href} className="cinematic-nav__link">
                    {item.label}
                  </a>
                )}
                {hoveredNav === item.label && (
                  <motion.div
                    className="cinematic-nav__indicator"
                    layoutId="navIndicator"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </div>
            ))}
          </nav>

          <div className="cinematic-nav__actions">
            <Link
              to="/login"
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-slate-600)' }}
            >
              Sign In
            </Link>
            <motion.div
              whileHover={shouldReduceMotion ? {} : { y: -2 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
            >
              <Link to="/app/scanner" className="btn-pill-cta" id="nav-verify-cta">
                <ScanLine size={16} />
                <span>Verify a Medicine</span>
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.header>

      {/* ----------------------------------------------------------------
          2. CINEMATIC FULL-WIDTH HERO SECTION WITH PARALLAX & STAGGER
          ---------------------------------------------------------------- */}
      <section ref={heroRef} className="cinematic-hero" aria-label="Hero Overview">
        {/* Parallax Hero Background Image */}
        <motion.div
          className="cinematic-hero__bg"
          style={{ scale: heroImageScale }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.0, ease: 'easeOut' }}
          aria-hidden="true"
        />
        <div className="cinematic-hero__overlay" aria-hidden="true" />

        <div className="cinematic-hero__inner">
          {/* Editorial Headline & Call to Action — Primary Focal Point */}
          <motion.div
            className="cinematic-hero__content"
            style={{ y: heroContentY }}
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="cinematic-hero__eyebrow" variants={heroFadeUp}>
              <Shield size={13} strokeWidth={2.4} />
              <span>MEDVERIFY / DIGITAL MEDICINE VERIFICATION</span>
            </motion.div>

            {/* Line-by-line editorial headline reveal */}
            <h1 className="cinematic-hero__headline">
              <span className="cinematic-hero__headline-line-wrap">
                <motion.span style={{ display: 'block' }} variants={headlineLineVariants}>
                  EVERY MEDICINE
                </motion.span>
              </span>
              <span className="cinematic-hero__headline-line-wrap">
                <motion.span style={{ display: 'block' }} variants={headlineLineVariants}>
                  HAS A STORY.
                </motion.span>
              </span>
              <span className="cinematic-hero__headline-line-wrap">
                <motion.span style={{ display: 'block' }} variants={headlineLineVariants}>
                  <span>VERIFY IT.</span>
                </motion.span>
              </span>
            </h1>

            <motion.p className="cinematic-hero__description" variants={heroFadeUp}>
              Scan a medicine&apos;s QR code or barcode to compare product, manufacturer,
              batch, and expiry parameters against a trusted digital registry in seconds.
            </motion.p>

            <motion.div className="cinematic-hero__cta-group" variants={heroFadeUp}>
              <motion.div
                whileHover={shouldReduceMotion ? {} : { y: -2 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
              >
                <Link to="/app/scanner" className="btn-hero-primary" id="hero-primary-cta">
                  <ScanLine size={19} strokeWidth={2.4} />
                  <span>SCAN &amp; VERIFY</span>
                </Link>
              </motion.div>
              <motion.div
                whileHover={shouldReduceMotion ? {} : { y: -2 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
              >
                <a href="#how-it-works" className="btn-hero-secondary">
                  <span>Explore Verification</span>
                  <ChevronRight size={17} />
                </a>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Floating Specimen Verification Card — Live System Supporting Headline */}
          <motion.div
            className="hero-specimen-card"
            style={{ y: verificationPanelY }}
            variants={panelEntrance}
            initial="hidden"
            animate="visible"
            aria-label="Live Specimen Verification Preview"
          >
            <div className="hero-specimen-card__header">
              <span className="hero-specimen-card__title">
                LIVE FORENSIC VERIFICATION
              </span>
              <span className="hero-specimen-card__live-tag">
                <motion.span
                  className="pulse-dot"
                  animate={
                    shouldReduceMotion
                      ? {}
                      : { scale: [1, 1.35, 1], opacity: [1, 0.65, 1] }
                  }
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                ACTIVE ENGINE
              </span>
            </div>

            <div className="hero-specimen-card__product-info">
              <div className="hero-specimen-card__icon-box">
                <QrCode size={22} />
              </div>
              <div>
                <div className="hero-specimen-card__name">Amoxicillin 500 mg</div>
                <div className="hero-specimen-card__sub">
                  GTIN: 00300450444129 · LOT: BATCH-2026-001
                </div>
              </div>
            </div>

            {/* Scanning HUD Simulation Beam */}
            <div className="hero-scanner-preview" aria-hidden="true">
              <div className="hero-scanner-beam" />
              <div className="hero-scanner-qr">
                <QrCode size={36} style={{ opacity: 0.9 }} />
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  <div style={{ color: '#2dd4bf', fontWeight: 700 }}>GS1 DIGITAL LINK DECODED</div>
                  <div style={{ color: '#94a3b8' }}>Cryptographic Hash Verified</div>
                </div>
              </div>
            </div>

            {/* Sequential Checklist Entrance */}
            <div className="hero-specimen-checks">
              {[
                { label: 'Product identifier (GTIN-14)', status: 'MATCH' },
                { label: 'Manufacturer Authorization', status: 'MATCH' },
                { label: 'Active Batch Integrity & Status', status: 'ACTIVE' },
                { label: 'Expiry Date Assessment', status: 'VALID' },
              ].map((c, i) => (
                <motion.div
                  key={c.label}
                  className="hero-check-row"
                  custom={i}
                  variants={checkItemVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <div className="hero-check-row__label">
                    <CheckCircle2 size={13} color="#10b981" />
                    <span>{c.label}</span>
                  </div>
                  <span className="hero-check-row__status">{c.status}</span>
                </motion.div>
              ))}
            </div>

            {/* Verification Result Banner with Checkmark Path Draw & Confidence Count-Up */}
            <motion.div
              className="hero-specimen-card__result"
              variants={resultBannerVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="hero-specimen-card__status-left">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#065f46"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <motion.path
                    d="M20 6L9 17l-5-5"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{
                      delay: shouldReduceMotion ? 0 : 1.9,
                      duration: 0.55,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                </svg>
                <span>VERIFIED AUTHENTIC</span>
              </div>
              <div className="hero-specimen-card__score">
                <AnimatedHeroScore targetScore={96} delay={1800} />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          3. HERO PROCESS INFORMATION BAR (SPACIOUS & INTERACTIVE)
          ---------------------------------------------------------------- */}
      <section className="hero-process-bar-wrap" aria-label="Verification Pipeline Stages">
        <motion.div
          className="hero-process-bar__card"
          variants={processBarVariants}
          initial="hidden"
          animate="visible"
        >
          {[
            {
              step: '01 · SCAN IT',
              title: 'Optical Capture',
              desc: 'High-resolution 2D DataMatrix and GS1 barcode optical ingestion.',
            },
            {
              step: '02 · IDENTIFY',
              title: 'Digital Link Decode',
              desc: 'Instant normalization of GTIN, lot number, expiration, and serial nonce.',
            },
            {
              step: '03 · CHECK IT',
              title: '6-Factor Registry Match',
              desc: 'Multi-parameter cross-reference against trusted pharmaceutical registry.',
            },
            {
              step: '04 · VERIFY IT',
              title: 'Forensic Decision',
              desc: 'Transparent, mathematical confidence scoring with explainable audit trail.',
            },
          ].map((item, index) => (
            <div
              key={item.step}
              className="hero-process-item"
              onMouseEnter={() => setHoveredProcessIndex(index)}
              onMouseLeave={() => setHoveredProcessIndex(null)}
            >
              {hoveredProcessIndex === index && (
                <motion.div
                  className="hero-process-item__highlight"
                  layoutId="processHighlight"
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                />
              )}
              <span className="hero-process-item__step">{item.step}</span>
              <span className="hero-process-item__title">{item.title}</span>
              <span className="hero-process-item__desc">{item.desc}</span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ----------------------------------------------------------------
          4. EDITORIAL PROBLEM & SOLUTION SECTION (GENEROUS BREATHING SPACE)
          ---------------------------------------------------------------- */}
      <section className="editorial-section" aria-label="Why MedVerify">
        <div className="editorial-grid">
          <motion.div
            className="editorial-left"
            variants={scrollGroupVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
          >
            <span className="editorial-badge">WHY MEDVERIFY</span>
            <h2>Verification shouldn&apos;t be complicated.</h2>
          </motion.div>

          <motion.div
            className="editorial-right"
            variants={scrollGroupVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
          >
            <p className="editorial-lead">
              Counterfeit and substandard medicines in the global supply chain place
              patient safety at risk and are nearly impossible to diagnose from packaging
              alone.
            </p>
            <p style={{ color: 'var(--color-slate-600)', lineHeight: 'var(--leading-relaxed)' }}>
              MedVerify provides a structured, explainable digital verification infrastructure.
              By cross-referencing packaging data against an immutable registry of authorized
              pharmaceutical manufacturers, MedVerify converts opaque QR codes into
              clinical clarity.
            </p>

            {/* Viewport-triggered animated metrics */}
            <div className="editorial-stats-row">
              <AnimatedMetric
                value={100}
                suffix="%"
                label="Deterministic scoring with zero black-box hallucinations"
                duration={1000}
              />
              <AnimatedMetric
                text="< 1s"
                label="High-speed camera ingestion from scan to clinical decision"
              />
              <AnimatedMetric
                value={6}
                label="Forensic checks evaluating product, batch, and packaging validity"
                duration={800}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          5. THE FOUR-STAGE VERIFICATION SEQUENCE (CONNECTED ILLUMINATED TRACK)
          ---------------------------------------------------------------- */}
      <section className="workflow-section" id="how-it-works" aria-label="How MedVerify Works">
        <div className="workflow-inner">
          <motion.div
            className="workflow-header"
            variants={scrollGroupVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
          >
            <h2>The Four-Stage Verification Sequence</h2>
            <p>
              Designed for clinical precision, healthcare compliance, and operational simplicity.
            </p>
          </motion.div>

          <div className="workflow-track-wrapper">
            {/* Visual connecting track bar for desktop */}
            <div className="workflow-track-line" aria-hidden="true">
              <motion.div
                className="workflow-track-progress"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            <motion.div
              className="workflow-steps-grid"
              variants={stageContainerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
            >
              {[
                {
                  num: '01',
                  icon: ScanLine,
                  title: 'Capture Specimen',
                  desc: 'Point device camera at any GS1 DataMatrix, standard QR code, or linear barcode on outer packaging.',
                },
                {
                  num: '02',
                  icon: QrCode,
                  title: 'Parse Identifiers',
                  desc: 'The ingestion engine extracts GTIN-14, batch numbers, manufacturing dates, and serial nonces.',
                },
                {
                  num: '03',
                  icon: Database,
                  title: 'Registry Cross-Match',
                  desc: 'Data is cross-referenced with authorized manufacturer records, batch status, and recall notices.',
                },
                {
                  num: '04',
                  icon: FileCheck,
                  title: 'Forensic Certificate',
                  desc: 'Outputs an explainable 0–100 confidence score with an immutable cryptographic audit record.',
                },
              ].map((step) => (
                <motion.div
                  key={step.num}
                  className="workflow-step-card"
                  variants={stageCardVariants}
                  whileHover={
                    shouldReduceMotion
                      ? {}
                      : { y: -6, transition: { duration: 0.2 } }
                  }
                >
                  <div className="workflow-step-top">
                    <span className="workflow-step-num">{step.num}</span>
                    <div className="workflow-step-icon">
                      <step.icon size={22} />
                    </div>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          6. INTERACTIVE VERIFICATION SHOWCASE (SMOOTH TABS & SCORE TRANSITION)
          ---------------------------------------------------------------- */}
      <section className="showcase-section" aria-label="Interactive Verification Demonstration">
        <div className="showcase-grid">
          <motion.div
            variants={scrollGroupVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
          >
            <span className="editorial-badge">TRANSPARENT ARCHITECTURE</span>
            <h2
              style={{
                fontSize: 'clamp(2rem, 3.2vw, 2.75rem)',
                fontWeight: 800,
                color: 'var(--color-slate-950)',
                margin: 'var(--space-3) 0 var(--space-4)',
                letterSpacing: '-0.025em',
              }}
            >
              Know why the result was generated.
            </h2>
            <p
              style={{
                fontSize: 'var(--text-base)',
                color: 'var(--color-slate-600)',
                lineHeight: '1.65',
                marginBottom: 'var(--space-6)',
              }}
            >
              Most verification tools output a simple green checkmark with zero context.
              MedVerify details the exact mathematical weight awarded to each forensic parameter,
              ensuring clinicians, pharmacists, and consumers understand the evidence.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {[
                'Product Identifier Match (30 pts max)',
                'Manufacturer Authorization (20 pts max)',
                'Active Batch Integrity (20 pts max)',
                'Expiration Date & Serial Uniqueness (25 pts max)',
              ].map((principle) => (
                <div
                  key={principle}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
                >
                  <CheckCircle2 size={18} color="var(--color-brand-600)" />
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color: 'var(--color-slate-800)',
                    }}
                  >
                    {principle}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 'var(--space-8)' }}>
              <motion.div
                whileHover={shouldReduceMotion ? {} : { y: -2 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
                style={{ display: 'inline-block' }}
              >
                <Link to="/app/scanner" className="btn btn-primary btn-lg">
                  <ScanLine size={18} />
                  <span>Test Interactive Scanner</span>
                </Link>
              </motion.div>
            </div>
          </motion.div>

          {/* Interactive Specimen Selector Card with Sliding Tab Indicator */}
          <motion.div
            className="showcase-card"
            variants={scrollGroupVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
          >
            <div className="showcase-tabs">
              {SHOWCASE_SPECIMENS.map((specimen) => {
                const isActive = activeSpecimenId === specimen.id;
                return (
                  <button
                    key={specimen.id}
                    onClick={() => setActiveSpecimenId(specimen.id)}
                    className={`showcase-tab-btn ${isActive ? 'is-active' : ''}`}
                  >
                    <span>
                      {specimen.name.split(' ')[0]} ({specimen.status})
                    </span>
                    {isActive && (
                      <motion.div
                        className="showcase-tab-underline"
                        layoutId="activeShowcaseTab"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Specimen Details with AnimatePresence */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSpecimen.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        fontSize: 'var(--text-lg)',
                        fontWeight: 800,
                        color: 'var(--color-slate-900)',
                      }}
                    >
                      {activeSpecimen.name}
                    </h3>
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-slate-500)',
                        marginTop: 2,
                      }}
                    >
                      {activeSpecimen.dosage} · {activeSpecimen.mfr}
                    </div>
                  </div>
                  <span
                    className={`badge badge-${activeSpecimen.badgeCls}`}
                    style={{ fontSize: 'var(--text-xs)', padding: '4px 10px' }}
                  >
                    {activeSpecimen.status}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-slate-600)',
                    background: 'var(--color-slate-50)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-5)',
                    lineHeight: 1.5,
                  }}
                >
                  {activeSpecimen.description}
                </p>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    marginBottom: 'var(--space-6)',
                  }}
                >
                  {activeSpecimen.checks.map((c) => (
                    <div
                      key={c.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid var(--color-slate-100)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: 'var(--color-slate-700)',
                        }}
                      >
                        {c.pass === true && <CheckCircle2 size={14} color="#10b981" />}
                        {c.pass === 'warn' && <AlertTriangle size={14} color="#f59e0b" />}
                        {c.pass === false && <XOctagon size={14} color="#ef4444" />}
                        <span>{c.name}</span>
                      </div>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: c.pass === false ? '#ef4444' : 'var(--color-slate-700)',
                        }}
                      >
                        {c.score}
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-4)',
                    background:
                      activeSpecimen.status === 'VERIFIED'
                        ? '#ecfdf5'
                        : activeSpecimen.status === 'REVIEW'
                        ? '#fffbeb'
                        : '#fef2f2',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${
                      activeSpecimen.status === 'VERIFIED'
                        ? '#a7f3d0'
                        : activeSpecimen.status === 'REVIEW'
                        ? '#fde68a'
                        : '#fecaca'
                    }`,
                    transition: 'all 0.3s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontWeight: 800,
                      fontSize: 'var(--text-sm)',
                      color:
                        activeSpecimen.status === 'VERIFIED'
                          ? '#065f46'
                          : activeSpecimen.status === 'REVIEW'
                          ? '#92400e'
                          : '#991b1b',
                    }}
                  >
                    <Shield size={18} />
                    <span>CONFIDENCE RATING: {activeSpecimen.status}</span>
                  </div>
                  <AnimatedShowcaseScore
                    score={activeSpecimen.score}
                    status={activeSpecimen.status}
                  />
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          7. THE FOUR VERIFICATION DECISIONS (DRAMATIC DARK SECTION)
          ---------------------------------------------------------------- */}
      <section className="status-taxonomy-section" aria-label="Status Classifications">
        <div className="status-taxonomy-inner">
          <motion.div
            className="status-taxonomy-header"
            variants={scrollGroupVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
          >
            <h2>The Four Verification Decisions</h2>
            <p>
              Every scan terminates in an unambiguous clinical decision with prescribed handling protocols.
            </p>
          </motion.div>

          <motion.div
            className="status-cards-grid"
            variants={decisionContainerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            {/* 01: VERIFIED */}
            <motion.div
              className="status-editorial-card status-editorial-card--verified"
              variants={decisionCardVariants}
              whileHover={shouldReduceMotion ? {} : { y: -4 }}
            >
              <div className="status-editorial-card__top">
                <span
                  className="status-editorial-card__badge"
                  style={{ backgroundColor: '#065f46', color: '#a7f3d0' }}
                >
                  <CheckCircle2 size={13} />
                  <span>VERIFIED</span>
                </span>
                <div
                  className="status-editorial-card__glyph"
                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34d399' }}
                >
                  ✓
                </div>
              </div>
              <h3>Authentic Specimen</h3>
              <p>
                All 6 parameters match the authorized manufacturer registry. Confirmed active lot with valid expiration date.
              </p>
              <div className="status-editorial-card__action">Protocol: Safe for dispensing and clinical use</div>
            </motion.div>

            {/* 02: REVIEW */}
            <motion.div
              className="status-editorial-card status-editorial-card--review"
              variants={decisionCardVariants}
              whileHover={shouldReduceMotion ? {} : { y: -4 }}
            >
              <div className="status-editorial-card__top">
                <span
                  className="status-editorial-card__badge"
                  style={{ backgroundColor: '#78350f', color: '#fde68a' }}
                >
                  <AlertTriangle size={13} />
                  <span>REVIEW REQUIRED</span>
                </span>
                <div
                  className="status-editorial-card__glyph"
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}
                >
                  !
                </div>
              </div>
              <h3>Information Inconsistency</h3>
              <p>
                Product identifier is authentic, but the batch number is unconfirmed or nearing expiration.
              </p>
              <div className="status-editorial-card__action">Protocol: Secondary inspection by supervising pharmacist</div>
            </motion.div>

            {/* 03: SUSPICIOUS */}
            <motion.div
              className="status-editorial-card status-editorial-card--suspicious"
              variants={decisionCardVariants}
              whileHover={shouldReduceMotion ? {} : { y: -4 }}
            >
              <div className="status-editorial-card__top">
                <span
                  className="status-editorial-card__badge"
                  style={{ backgroundColor: '#7f1d1d', color: '#fecaca' }}
                >
                  <XOctagon size={13} />
                  <span>SUSPICIOUS</span>
                </span>
                <div
                  className="status-editorial-card__glyph"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#f87171' }}
                >
                  !
                </div>
              </div>
              <h3>Counterfeit Anomaly</h3>
              <p>
                Critical parameters conflict with manufacturer data, lot is known to be recalled, or serial was previously scanned.
              </p>
              <div className="status-editorial-card__action">Protocol: Immediate lot quarantine &amp; adverse incident report</div>
            </motion.div>

            {/* 04: NOT FOUND */}
            <motion.div
              className="status-editorial-card status-editorial-card--notfound"
              variants={decisionCardVariants}
              whileHover={shouldReduceMotion ? {} : { y: -4 }}
            >
              <div className="status-editorial-card__top">
                <span
                  className="status-editorial-card__badge"
                  style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}
                >
                  <HelpCircle size={13} />
                  <span>NOT FOUND</span>
                </span>
                <div
                  className="status-editorial-card__glyph"
                  style={{ backgroundColor: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1' }}
                >
                  ?
                </div>
              </div>
              <h3>Unregistered Product</h3>
              <p>
                The scanned barcode or data matrix is not cataloged in the authorized registry database.
              </p>
              <div className="status-editorial-card__action">Protocol: Contact supply chain administrator for registry sync</div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          8. INSTITUTIONAL TRUST & INTEGRITY PILLARS (CLEAN & SPACIOUS)
          ---------------------------------------------------------------- */}
      <section className="trust-section" aria-label="Trust Pillars">
        <div className="trust-header">
          <span className="editorial-badge">SAFETY &amp; INTEGRITY</span>
          <h2>Built for verification. Designed for trust.</h2>
          <p>
            Medicine verification requires mathematical precision and transparent evidence.
          </p>
        </div>

        <motion.div
          className="trust-grid"
          variants={stageContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {[
            {
              icon: Lock,
              title: 'Cryptographic Audit Ledger',
              desc: 'Every scan generates an immutable UUID and verification signature stored in a tamper-evident history ledger.',
            },
            {
              icon: Layers,
              title: 'GS1 Global Standard Compatible',
              desc: 'Direct parsing of Application Identifiers (01 GTIN, 17 Expiry, 10 Lot, 21 Serial) for universal healthcare interoperability.',
            },
            {
              icon: Sparkles,
              title: 'Explainable Forensic Scoring',
              desc: 'Zero opaque neural outputs. Users inspect the exact 6-parameter mathematical point deductions behind every score.',
            },
            {
              icon: Shield,
              title: 'Supply Chain Safeguards',
              desc: 'Automated detection of expired lots, anomalous serial nonces, and unverified pharmaceutical suppliers.',
            },
          ].map((pillar) => (
            <motion.div
              key={pillar.title}
              className="trust-card"
              variants={stageCardVariants}
              whileHover={shouldReduceMotion ? {} : { y: -4, transition: { duration: 0.2 } }}
            >
              <div className="trust-card__icon">
                <pillar.icon size={22} />
              </div>
              <h3>{pillar.title}</h3>
              <p>{pillar.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ----------------------------------------------------------------
          9. CALL TO ACTION BANNER (TACTILE INTERACTIONS)
          ---------------------------------------------------------------- */}
      <section className="cinematic-cta-banner" aria-label="Start Scanning Call to Action">
        <div className="cinematic-cta-banner__inner">
          <motion.div
            variants={scrollGroupVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
          >
            <h2>Scan a medicine. Know what you&apos;re looking at.</h2>
            <p>
              Verify authenticity, detect counterfeit packaging anomalies, and access
              transparent clinical verification in seconds.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-4)',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <motion.div
                whileHover={shouldReduceMotion ? {} : { y: -2 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
              >
                <Link to="/app/scanner" className="btn-hero-primary" id="footer-verify-cta">
                  <ScanLine size={19} strokeWidth={2.4} />
                  <span>OPEN SCANNER NOW</span>
                </Link>
              </motion.div>
              <motion.div
                whileHover={shouldReduceMotion ? {} : { y: -2 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
              >
                <Link to="/app/registry" className="btn-hero-secondary">
                  <span>View Product Registry</span>
                  <ExternalLink size={16} />
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ----------------------------------------------------------------
          10. PREMIUM INSTITUTIONAL FOOTER
          ---------------------------------------------------------------- */}
      <footer className="cinematic-footer" role="contentinfo">
        <div className="cinematic-footer__inner">
          <div className="cinematic-footer__col">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div className="brand-mark" style={{ width: 32, height: 32 }}>
                <Shield size={18} strokeWidth={2.4} />
                <span className="brand-dot" />
              </div>
              <span
                style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 800,
                  color: 'var(--color-navy-950)',
                }}
              >
                MEDVERIFY
              </span>
            </div>
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-slate-500)',
                lineHeight: 1.6,
                maxWidth: 320,
              }}
            >
              Digital medicine verification platform for packaging authentication,
              counterfeit screening, and supply chain integrity.
            </p>
          </div>

          <div className="cinematic-footer__col">
            <h4>Platform</h4>
            <ul className="cinematic-footer__links">
              <li>
                <Link to="/app/scanner">Optical Scanner</Link>
              </li>
              <li>
                <Link to="/app/registry">Medicine Registry</Link>
              </li>
              <li>
                <Link to="/app/history">Audit Ledger</Link>
              </li>
              <li>
                <Link to="/app/admin">Command Center</Link>
              </li>
            </ul>
          </div>

          <div className="cinematic-footer__col">
            <h4>Forensics &amp; Standards</h4>
            <ul className="cinematic-footer__links">
              <li>
                <Link to="/about">6-Factor Algorithm</Link>
              </li>
              <li>
                <a href="#how-it-works">GS1 Digital Link</a>
              </li>
              <li>
                <Link to="/about">Decision Rubric</Link>
              </li>
              <li>
                <Link to="/login">Admin Authentication</Link>
              </li>
            </ul>
          </div>

          <div className="cinematic-footer__col">
            <h4>Regulatory Notice</h4>
            <p style={{ fontSize: '11px', color: 'var(--color-slate-400)', lineHeight: 1.5 }}>
              MedVerify is a digital screening prototype designed for rapid packaging verification.
              Screening outputs are not substitutes for laboratory chromatography, spectrometry,
              or official regulatory seizure determinations.
            </p>
          </div>
        </div>

        <div className="cinematic-footer__bottom">
          <div>
            &copy; 2026 MedVerify Inc. All rights reserved. Built for Healthcare Safety Hackathon.
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
            <span>GS1 Standard Compliant</span>
            <span>Local Demonstration Database</span>
            <span>WCAG 2.2 AAA Contrast</span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
