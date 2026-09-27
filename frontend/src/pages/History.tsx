import React, { useEffect, useState } from 'react';
import { Link } from '../router';
import { motion } from 'framer-motion';
import {
  ClipboardList,
  Search,
  ExternalLink,
  ScanLine,
  Filter,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { getVerifications } from '../api/client';
import type { VerificationListItem, VerificationStatus } from '../types';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { pageVariants } from '../animations/motion';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All Inspections', value: '' },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Review Required', value: 'REVIEW' },
  { label: 'Suspicious', value: 'SUSPICIOUS' },
  { label: 'Not Found', value: 'NOT_FOUND' },
];

export default function History() {
  const [items, setItems] = useState<VerificationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 12;

  useEffect(() => {
    setLoading(true);
    getVerifications({ status: statusFilter || undefined, page, limit })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
    >
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              color: 'var(--color-slate-900)',
              letterSpacing: '-0.02em',
            }}
          >
            Verification Audit Ledger
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-500)', marginTop: 2 }}>
            Complete forensic log of scanned pharmaceutical packaging and cryptographic verdicts.
          </p>
        </div>

        <Link to="/app/scanner" className="btn btn-primary btn-sm">
          <ScanLine size={14} />
          <span>New Verification</span>
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((f) => {
            const isSelected = statusFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  backgroundColor: isSelected ? 'var(--color-brand-700)' : 'transparent',
                  color: isSelected ? '#ffffff' : 'var(--color-slate-600)',
                  border: isSelected ? '1px solid transparent' : '1px solid var(--color-border)',
                }}
                onClick={() => {
                  setStatusFilter(f.value);
                  setPage(1);
                }}
              >
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>

        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
          {total} logged event{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Audit Table */}
      {loading ? (
        <div className="empty-state" style={{ minHeight: '40vh' }}>
          <div className="modal-step-item__spinner" style={{ width: 28, height: 28 }} />
          <h3 className="empty-state__title" style={{ marginTop: 'var(--space-4)' }}>
            Querying Audit Ledger...
          </h3>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No verification events found"
          description={
            statusFilter
              ? `No records found matching status "${statusFilter}". Try changing the filter.`
              : 'The verification audit ledger is currently empty. Run your first medicine verification scan to populate it.'
          }
          action={{
            label: 'Open Verification Scanner',
            href: '/app/scanner',
          }}
        />
      ) : (
        <div className="med-table-wrapper">
          <table className="med-table">
            <thead>
              <tr>
                <th>Status Verdict</th>
                <th>Confidence</th>
                <th>Specimen Product</th>
                <th>Raw Identifier / GTIN</th>
                <th>Manufacturer</th>
                <th>Timestamp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.verification_id}>
                  <td>
                    <StatusBadge status={item.status} size="sm" />
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: 'var(--text-sm)',
                        color:
                          item.status === 'VERIFIED'
                            ? 'var(--color-verified-text)'
                            : item.status === 'SUSPICIOUS'
                            ? 'var(--color-suspicious-text)'
                            : 'var(--color-slate-700)',
                      }}
                    >
                      {item.confidence_score}%
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: 'var(--color-slate-900)' }}>
                      {item.product_name || 'Unregistered Product'}
                    </span>
                  </td>
                  <td className="font-mono" style={{ fontSize: '12px' }}>
                    {item.raw_identifier}
                  </td>
                  <td style={{ color: 'var(--color-slate-600)' }}>
                    {item.manufacturer || '—'}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--color-slate-400)' }}>
                    {new Date(item.created_at).toLocaleString([], {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td>
                    <Link
                      to={`/app/result/${item.verification_id}`}
                      className="btn btn-secondary btn-sm"
                      title="Inspect Certificate"
                    >
                      <span>Inspect</span>
                      <ExternalLink size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) 0',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
            Page {page} of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
