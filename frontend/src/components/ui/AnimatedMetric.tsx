import React, { useEffect, useState, useRef } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

interface AnimatedMetricProps {
  value?: number;
  prefix?: string;
  suffix?: string;
  text?: string;
  label: string;
  duration?: number;
}

export const AnimatedMetric: React.FC<AnimatedMetricProps> = ({
  value,
  prefix = '',
  suffix = '',
  text,
  label,
  duration = 1000,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  const shouldReduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<number>(0);

  useEffect(() => {
    if (!isInView || value === undefined) return;
    if (shouldReduceMotion) {
      setDisplayValue(value);
      return;
    }

    let startTime: number | null = null;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * ease));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isInView, value, duration, shouldReduceMotion]);

  return (
    <div ref={ref} className="editorial-stat-block">
      <div className="editorial-stat-block__num">
        {text ? (
          <span
            style={{
              opacity: isInView ? 1 : 0,
              transform: isInView ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
              display: 'inline-block',
            }}
          >
            {text}
          </span>
        ) : (
          <span className="tabular-nums">
            {prefix}
            {displayValue}
            {suffix}
          </span>
        )}
      </div>
      <div className="editorial-stat-block__label">{label}</div>
    </div>
  );
};

export default AnimatedMetric;
