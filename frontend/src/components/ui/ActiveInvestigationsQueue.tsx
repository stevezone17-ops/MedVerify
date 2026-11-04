import React from 'react';
import { Filter, Check } from 'lucide-react';
import type { VerificationStatus } from '../../types';

interface ActiveInvestigationsQueueProps {
  suspiciousCount: number;
  reviewCount: number;
  notFoundCount: number;
  activeFilter: 'ALL' | VerificationStatus;
  onFilterChange: (status: 'ALL' | VerificationStatus) => void;
  className?: string;
}

export const ActiveInvestigationsQueue: React.FC<ActiveInvestigationsQueueProps> = ({
  suspiciousCount,
  reviewCount,
  notFoundCount,
  activeFilter,
  onFilterChange,
  className = '',
}) => {
  const totalAnomalies = suspiciousCount + reviewCount + notFoundCount;

  const categories = [
    {
      id: 'SUSPICIOUS' as const,
      category: 'Suspicious / Cloned',
      description: 'Serial collision detected or anti-tamper security matrix compromised',
      count: suspiciousCount,
      severity: 'critical' as const,
    },
    {
      id: 'REVIEW' as const,
      category: 'Review Required',
      description: 'Regulatory expiry breach, batch warning, or incomplete payload',
      count: reviewCount,
      severity: 'warning' as const,
    },
    {
      id: 'NOT_FOUND' as const,
      category: 'Not Registered',
      description: 'GTIN or packaging code uncataloged in national manufacturer ledger',
      count: notFoundCount,
      severity: 'neutral' as const,
    },
  ];

  return (
    <div className={`anomaly-triage-panel ${className}`}>
      <div className="anomaly-triage-header">
        <div>
          <span className="command-eyebrow">ANOMALY TRIAGE QUEUE</span>
          <h3 className="command-section-title">Active Investigations</h3>
          <p className="command-section-desc">
            Classified verification exceptions requiring compliance verification or audit isolation.
          </p>
        </div>
        <div className="anomaly-triage-header-actions">
          <span className="anomaly-triage-flagged-tag">
            {totalAnomalies} {totalAnomalies === 1 ? 'anomaly' : 'anomalies'} total
          </span>
          <button
            type="button"
            className={`btn-triage-reset ${activeFilter === 'ALL' ? 'is-active' : ''}`}
            onClick={() => onFilterChange('ALL')}
            title="Reset active filter to display all verifications"
          >
            Show All
          </button>
        </div>
      </div>

      <div className="anomaly-triage-table-wrapper">
        <table className="anomaly-triage-table" aria-label="Anomaly Triage Investigations">
          <thead>
            <tr>
              <th scope="col" style={{ width: '28%' }}>Category</th>
              <th scope="col" style={{ width: '46%' }}>Description</th>
              <th scope="col" style={{ width: '12%', textAlign: 'right' }}>Count</th>
              <th scope="col" style={{ width: '14%', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const isSelected = activeFilter === cat.id;

              return (
                <tr
                  key={cat.id}
                  className={`anomaly-triage-row ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onFilterChange(isSelected ? 'ALL' : cat.id)}
                >
                  <td className="anomaly-cell-category">
                    <span className={`severity-indicator severity-indicator--${cat.severity}`} aria-hidden="true" />
                    <span className="anomaly-category-name">{cat.category}</span>
                  </td>
                  <td className="anomaly-cell-desc">
                    <span className="anomaly-desc-text">{cat.description}</span>
                  </td>
                  <td className="anomaly-cell-count" style={{ textAlign: 'right' }}>
                    <span className={`anomaly-count-badge ${cat.count > 0 ? `anomaly-count-badge--${cat.severity}` : 'anomaly-count-badge--zero'} tabular-nums`}>
                      {cat.count.toLocaleString()}
                    </span>
                  </td>
                  <td className="anomaly-cell-action" style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className={`btn-triage-filter ${isSelected ? 'btn-triage-filter--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFilterChange(isSelected ? 'ALL' : cat.id);
                      }}
                      aria-pressed={isSelected}
                    >
                      {isSelected ? (
                        <>
                          <Check size={12} />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <Filter size={12} />
                          <span>Filter</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActiveInvestigationsQueue;
