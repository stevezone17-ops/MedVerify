import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Cpu, Database, Network } from 'lucide-react';
import { cardHoverVariants } from '../../animations/motion';

interface SystemHealthWidgetProps {
  integrityScore?: number;
  registryStatus?: 'Healthy' | 'Degraded' | 'Offline';
  engineStatus?: 'Operational' | 'Busy' | 'Offline';
  apiStatus?: 'Operational' | 'Latency' | 'Offline';
  className?: string;
}

export const SystemHealthWidget: React.FC<SystemHealthWidgetProps> = ({
  integrityScore = 98,
  registryStatus = 'Healthy',
  engineStatus = 'Operational',
  apiStatus = 'Operational',
  className = '',
}) => {
  const radius = 34;
  const strokeWidth = 6;
  const size = 88;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (integrityScore / 100) * circumference;

  return (
    <motion.div
      variants={cardHoverVariants}
      initial="initial"
      whileHover="hover"
      className={`system-health-widget ${className}`}
    >
      <div className="system-health-widget__header">
        <div className="system-health-widget__title-wrap">
          <span className="system-health-widget__eyebrow">VERIFICATION INFRASTRUCTURE</span>
          <h3 className="system-health-widget__title">System Trust & Health</h3>
        </div>
        <div className="system-health-widget__badge">
          <span className="system-health-widget__live-dot" />
          Live Telemetry
        </div>
      </div>

      <div className="system-health-widget__body">
        {/* Ring indicator */}
        <div className="system-health-widget__ring-container">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(22, 110, 84, 0.12)"
              strokeWidth={strokeWidth}
            />
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
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className="system-health-widget__ring-center">
            <span className="system-health-widget__score">{integrityScore}%</span>
            <span className="system-health-widget__score-label">HEALTH</span>
          </div>
        </div>

        {/* Telemetry rows */}
        <div className="system-health-widget__telemetry-list">
          <div className="telemetry-item">
            <div className="telemetry-item__left">
              <Database size={14} className="telemetry-item__icon" />
              <span className="telemetry-item__name">Registry Integrity</span>
            </div>
            <div className="telemetry-item__status telemetry-item__status--healthy">
              <span className="telemetry-item__pip" />
              <span>{registryStatus}</span>
            </div>
          </div>

          <div className="telemetry-item">
            <div className="telemetry-item__left">
              <Cpu size={14} className="telemetry-item__icon" />
              <span className="telemetry-item__name">Verification Engine</span>
            </div>
            <div className="telemetry-item__status telemetry-item__status--healthy">
              <span className="telemetry-item__pip" />
              <span>{engineStatus}</span>
            </div>
          </div>

          <div className="telemetry-item">
            <div className="telemetry-item__left">
              <Network size={14} className="telemetry-item__icon" />
              <span className="telemetry-item__name">API Endpoints</span>
            </div>
            <div className="telemetry-item__status telemetry-item__status--healthy">
              <span className="telemetry-item__pip" />
              <span>{apiStatus}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default SystemHealthWidget;
