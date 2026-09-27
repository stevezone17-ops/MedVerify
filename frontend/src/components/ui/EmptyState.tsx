import React from 'react';
import { type LucideIcon, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { fadeUp } from '../../animations/motion';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = HelpCircle,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className={`empty-state ${className}`}
    >
      <div className="empty-state__icon-ring">
        <Icon size={28} className="empty-state__icon" aria-hidden="true" />
      </div>
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__description">{description}</p>
      {action && (
        <div className="empty-state__action">
          {action.href ? (
            <a href={action.href} className="btn btn-primary">
              {action.label}
            </a>
          ) : (
            <button type="button" onClick={action.onClick} className="btn btn-primary">
              {action.label}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default EmptyState;
