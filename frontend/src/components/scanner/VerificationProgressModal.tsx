import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Shield, Search, Database, Layers, Award } from 'lucide-react';
import { modalVariants } from '../../animations/motion';

interface Step {
  id: string;
  title: string;
  detail: string;
  icon: typeof Search;
}

const STEPS: Step[] = [
  {
    id: 'read',
    title: 'Parsing Identifier Payload',
    detail: 'Extracting GTIN, batch code & serial format...',
    icon: Search,
  },
  {
    id: 'lookup',
    title: 'Querying Pharmaceutical Registry',
    detail: 'Retrieving official manufacturer registration...',
    icon: Database,
  },
  {
    id: 'checks',
    title: 'Evaluating 6 Security Dimensions',
    detail: 'Checking manufacturer, batch, expiry & serial uniqueness...',
    icon: Layers,
  },
  {
    id: 'verdict',
    title: 'Generating Explainable Verdict',
    detail: 'Computing confidence score & integrity status...',
    icon: Award,
  },
];

interface VerificationProgressModalProps {
  isOpen: boolean;
  onComplete?: () => void;
}

export const VerificationProgressModal: React.FC<VerificationProgressModalProps> = ({
  isOpen,
  onComplete,
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setActiveStepIndex(0);
      return;
    }

    const timer1 = setTimeout(() => setActiveStepIndex(1), 320);
    const timer2 = setTimeout(() => setActiveStepIndex(2), 650);
    const timer3 = setTimeout(() => setActiveStepIndex(3), 980);
    const timerDone = setTimeout(() => {
      if (onComplete) onComplete();
    }, 1300);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timerDone);
    };
  }, [isOpen, onComplete]);

  if (!isOpen) return null;

  return (
    <div className="verification-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="verification-dialog-title">
      <motion.div
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="verification-modal"
      >
        <div className="verification-modal__header">
          <div className="verification-modal__shield-icon">
            <Shield size={22} />
          </div>
          <div>
            <h3 id="verification-dialog-title" className="verification-modal__title">
              Verification Engine Active
            </h3>
            <p className="verification-modal__subtitle">
              Running multi-factor packaging and registry verification
            </p>
          </div>
        </div>

        <div className="verification-modal__steps">
          {STEPS.map((step, idx) => {
            const isCompleted = idx < activeStepIndex;
            const isCurrent = idx === activeStepIndex;
            const isPending = idx > activeStepIndex;

            const Icon = step.icon;

            return (
              <div
                key={step.id}
                className={`modal-step-item ${
                  isCompleted ? 'is-completed' : isCurrent ? 'is-current' : 'is-pending'
                }`}
              >
                <div className="modal-step-item__indicator">
                  {isCompleted ? (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CheckCircle2 size={18} className="modal-step-item__check-icon" />
                    </motion.div>
                  ) : isCurrent ? (
                    <Loader2 size={18} className="modal-step-item__spinner" />
                  ) : (
                    <span className="modal-step-item__dot" />
                  )}
                </div>

                <div className="modal-step-item__content">
                  <div className="modal-step-item__title-row">
                    <span className="modal-step-item__title">{step.title}</span>
                    {isCompleted && <span className="modal-step-item__badge">Passed</span>}
                    {isCurrent && <span className="modal-step-item__badge modal-step-item__badge--active">Active</span>}
                  </div>
                  <span className="modal-step-item__detail">{step.detail}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="verification-modal__footer">
          <span className="verification-modal__hint">
            Cryptographic cross-referencing in progress. Do not close this window.
          </span>
        </div>
      </motion.div>
    </div>
  );
};

export default VerificationProgressModal;
