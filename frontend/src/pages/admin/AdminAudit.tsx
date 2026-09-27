import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardList,
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Shield,
  User as UserIcon,
  Calendar,
} from 'lucide-react';
import { getAdminAudit } from '../../api/client';
import type { VerificationListItem, VerificationStatus } from '../../types';
import StatusBadge from '../../components/ui/StatusBadge';
import InspectionDrawer from '../../components/ui/InspectionDrawer';

export const AdminAudit: React.FC = () => {
  const [items, setItems] = useState<VerificationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedInspection, setSelectedInspection] = useState<VerificationListItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const res = await getAdminAudit({
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        page,
        limit,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error('Failed to load admin audit:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAudit();
  };

  const handleInspect = (item: VerificationListItem) => {
    setSelectedInspection(item);
    setIsDrawerOpen(true);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  const STATUS_TABS: { label: string; value: string }[] = [
    { label: 'All Global Events', value: '' },
    { label: 'Verified', value: 'VERIFIED' },
    { label: 'Review Required', value: 'REVIEW' },
    { label: 'Suspicious', value: 'SUSPICIOUS' },
    { label: 'Not Registered', value: 'NOT_FOUND' },
  ];

  return (
    <div className="admin-audit-container">
      {/* Header */}
      <div className="admin-audit-header">
        <div>
          <span className="admin-audit-eyebrow">MEDVERIFY / FORENSIC AUDIT TRAIL</span>
          <h1 className="admin-audit-title">Global Verification Audit Log</h1>
          <p className="admin-audit-subtitle">
            Immutable system-wide ledger of every medicine verification event across all clinical users,
            pharmacies, and automated gateway endpoints.
          </p>
        </div>

        <button onClick={fetchAudit} className="admin-audit-refresh-btn" title="Refresh Audit Log">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="admin-audit-toolbar">
        <form onSubmit={handleSearchSubmit} className="admin-audit-search-form">
          <Search size={16} className="admin-audit-search-icon" />
          <input
            type="text"
            placeholder="Search by operator name, product, batch, or raw barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="admin-audit-search-input"
          />
          <button type="submit" className="admin-audit-search-btn">
            Search
          </button>
        </form>

        <div className="admin-audit-status-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`admin-audit-tab-btn ${statusFilter === tab.value ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="admin-audit-table-card">
        {loading ? (
          <div className="admin-audit-loading">Loading immutable audit ledger...</div>
        ) : items.length === 0 ? (
          <div className="admin-audit-empty">No audit ledger records match the query.</div>
        ) : (
          <div className="admin-audit-table-wrap">
            <table className="admin-audit-table">
              <thead>
                <tr>
                  <th>VERDICT</th>
                  <th>CONFIDENCE</th>
                  <th>MEDICINE SPECIMEN</th>
                  <th>OPERATOR / ENDPOINT</th>
                  <th>RAW BARCODE IDENTIFIER</th>
                  <th>TIMESTAMP</th>
                  <th style={{ textAlign: 'right' }}>INSPECT</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.verification_id} onClick={() => handleInspect(row)} className="admin-audit-row">
                    <td>
                      <StatusBadge status={row.status} size="sm" />
                    </td>
                    <td>
                      <span className="admin-audit-score">
                        {row.confidence_score > 0 ? `${row.confidence_score}%` : '0%'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-audit-medicine-cell">
                        <span className="admin-audit-product-name">{row.product_name || 'Unregistered Product'}</span>
                        <span className="admin-audit-verif-id">ID: {row.verification_id}</span>
                      </div>
                    </td>
                    <td>
                      <span className="admin-audit-operator">{row.manufacturer || 'System Scan'}</span>
                    </td>
                    <td>
                      <code className="admin-audit-code">{row.raw_identifier}</code>
                    </td>
                    <td>
                      <span className="admin-audit-time">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : 'N/A'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInspect(row);
                        }}
                        className="admin-audit-inspect-btn"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="admin-audit-pagination">
          <div className="admin-audit-pagination-info">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} global records
          </div>

          <div className="admin-audit-pagination-controls">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="admin-audit-page-btn"
            >
              <ChevronLeft size={16} />
              <span>Previous</span>
            </button>

            <span className="admin-audit-page-num">
              Page {page} of {totalPages}
            </span>

            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="admin-audit-page-btn"
            >
              <span>Next</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Slide-over Inspection Drawer */}
      <InspectionDrawer
        isOpen={isDrawerOpen}
        item={selectedInspection}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
};

export default AdminAudit;
