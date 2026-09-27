import React from 'react';
import { motion } from 'framer-motion';
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';
import { cardHoverVariants } from '../../animations/motion';

interface MetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: 'hero' | 'standard' | 'highlight';
  accent?: 'emerald' | 'amber' | 'crimson' | 'slate' | 'navy';
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
    label: string;
  };
  suffix?: string;
  children?: React.ReactNode;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'standard',
  accent = 'slate',
  trend,
  suffix = '',
  children,
  className = '',
}) => {
  const isHero = variant === 'hero';

  return (
    <motion.div
      variants={cardHoverVariants}
      initial="initial"
      whileHover="hover"
      className={`metric-card metric-card--${variant} metric-card--accent-${accent} ${className}`}
    >
      <div className="metric-card__header">
        <div className="metric-card__title-group">
          <span className="metric-card__eyebrow">{title}</span>
          {subtitle && !isHero && <span className="metric-card__subtitle">{subtitle}</span>}
        </div>
        {Icon && (
          <div className={`metric-card__icon-wrapper metric-card__icon-wrapper--${accent}`}>
            <Icon size={isHero ? 22 : 18} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="metric-card__body">
        <div className="metric-card__value-row">
          <h2 className="metric-card__value">
            <AnimatedNumber value={value} suffix={suffix} />
          </h2>
          {trend && (
            <span className={`metric-card__trend metric-card__trend--${trend.direction}`}>
              {trend.direction === 'up' && <TrendingUp size={12} />}
              {trend.direction === 'down' && <TrendingDown size={12} />}
              {trend.direction === 'neutral' && <Minus size={12} />}
              <span>{trend.value}</span>
            </span>
          )}
        </div>

        {isHero && subtitle && (
          <p className="metric-card__hero-subtitle">{subtitle}</p>
        )}

        {children && <div className="metric-card__extra">{children}</div>}
      </div>
    </motion.div>
  );
};

export default MetricCard;
