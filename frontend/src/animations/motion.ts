import { type Variants, type Transition } from 'framer-motion';

/**
 * Standard spring and ease transitions for MedVerify
 * Respects subtle, high-precision enterprise feeling.
 */
export const transitions: Record<string, Transition> = {
  springFast: { type: 'spring', stiffness: 400, damping: 30 },
  springNormal: { type: 'spring', stiffness: 300, damping: 25 },
  springSmooth: { type: 'spring', stiffness: 200, damping: 22 },
  easeFast: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
  easeNormal: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
  easeSlow: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  easeSmooth: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
};

/**
 * Page container transition
 */
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.easeNormal,
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: transitions.easeFast,
  },
};

/**
 * Staggered container for lists, grids, tables
 */
export const staggerContainer: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.04,
    },
  },
};

/**
 * Individual item in a staggered list
 */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.easeNormal,
  },
};

/**
 * Fade In utility
 */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transitions.easeNormal },
  exit: { opacity: 0, transition: transitions.easeFast },
};

/**
 * Fade up utility
 */
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: transitions.easeNormal },
};

/**
 * Scale in utility
 */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1, transition: transitions.springNormal },
  exit: { opacity: 0, scale: 0.94, transition: transitions.easeFast },
};

/**
 * Slide from left (timeline events)
 */
export const slideFromLeft: Variants = {
  initial: { opacity: 0, x: -16 },
  animate: { opacity: 1, x: 0, transition: transitions.easeNormal },
};

/**
 * Drawer slide-over variants (Right side inspection panel)
 */
export const drawerVariants: Variants = {
  initial: { x: '100%', opacity: 0.8 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', damping: 28, stiffness: 260 },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  },
};

/**
 * Drawer Backdrop
 */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

/**
 * Modal / Command Palette animation
 */
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.springNormal,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -8,
    transition: transitions.easeFast,
  },
};

/**
 * SVG Path drawing animation (for live graph line)
 */
export const pathDrawVariants: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 1.4, ease: [0.16, 1, 0.3, 1] },
      opacity: { duration: 0.3 },
    },
  },
};

/**
 * Subtle live engine status pulse (not neon, respectful)
 */
export const pulseVariants: Variants = {
  initial: { opacity: 0.55 },
  animate: {
    opacity: [0.55, 1, 0.55],
    transition: {
      duration: 2.8,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Subtle card hover interaction
 */
export const cardHoverVariants: Variants = {
  initial: { y: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  hover: {
    y: -2,
    boxShadow: '0 8px 24px rgba(6, 78, 59, 0.07)',
    transition: transitions.easeFast,
  },
};

/**
 * Button tap/press
 */
export const buttonTapVariants: Variants = {
  initial: { scale: 1 },
  hover: { scale: 1.015, transition: transitions.easeFast },
  tap: { scale: 0.985, transition: transitions.springFast },
};

/**
 * Scan beam animation for QR / barcode scanner
 */
export const scanBeamVariants: Variants = {
  initial: { top: '5%', opacity: 0 },
  animate: {
    top: ['5%', '92%', '5%'],
    opacity: [0.6, 1, 0.6],
    transition: {
      duration: 2.4,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};
