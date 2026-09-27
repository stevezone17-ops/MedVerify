import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Cpu, Database, Network } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';

interface HealthGaugeProps {
  score?: number;
  registryStatus?: string;
  engineStatus?: string;
  apiStatus?: string;
  className?: string;
}

export const HealthGauge: React.FC<HealthGaugeProps> = ({
  score = 98,
  registryStatus = 'Operational',
  engineStatus = 'Active & Synchronized',
  apiStatus = 'Low Latency (24ms)',
  className = '',
}) => {
  const size = 110;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className={`health-gauge-console ${className}`}>
      <div className="health-gauge-console__header">
        <div className="health-gauge-console__label-wrap">
          <span className="command-eyebrow">DIGITAL TRUST MATRIX</span>
          <h3 className="command-section-title">Verification Health</h3>
        </div>
        <div className="health-gauge-console__pill">
          <span className="health-gauge-console__pip-live" />
          <span>REAL-TIME</span>
        </div>
      </div>

      <div className="health-gauge-console__content">
        <div className="health-gauge-console__dial-area">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="health-gauge-console__svg"
            aria-label={`System health rating: ${score} percent`}
          >
            {/* Background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(15, 118, 110, 0.12)"
              strokeWidth={strokeWidth}
            />
            {/* Progress ring */}
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--color-brand-600)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className="health-gauge-console__dial-info">
            <span className="health-gauge-console__score">
              <AnimatedNumber value={score} suffix="%" />
            </span>
            <span className="health-gauge-console__verdict">HEALTHY</span>
          </div>
        </div>

        {/* Subsystem Telemetry List */}
        <div className="health-gauge-console__subsystems">
          <div className="health-subsystem-row">
            <div className="health-subsystem-row__left">
              <Database size={13} className="health-subsystem-row__icon" />
              <span>Registry Integrity</span>
            </div>
            <div className="health-subsystem-row__status">
              <span className="health-subsystem-row__dot" />
              <span>{registryStatus}</span>
            </div>
          </div>

          <div className="health-subsystem-row">
            <div className="health-subsystem-row__left">
              <Cpu size={13} className="health-subsystem-row__icon" />
              <span>Verification Engine</span>
            </div>
            <div className="health-subsystem-row__status">
              <span className="health-subsystem-row__dot" />
              <span>{engineStatus}</span>
            </div>
          </div>

          <div className="health-subsystem-row">
            <div className="health-subsystem-row__left">
              <Network size={13} className="health-subsystem-row__icon" />
              <span>API Gateway</span>
            </div>
            <div className="health-subsystem-row__status">
              <span className="health-subsystem-row__dot" />
              <span>{apiStatus}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthGauge;
