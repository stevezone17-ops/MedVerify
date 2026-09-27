import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  Calendar,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Link, useNavigate } from '../../router';
import { getUserHistory } from '../../api/client';
import type { VerificationListItem, VerificationStatus } from '../../types';
import StatusBadge from '../../components/ui/StatusBadge';

export const UserHistory: React.FC = () => {
  const [items, setItems] = useState<VerificationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await getUserHistory({
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        page,
        limit,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error('Failed to load user history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchHistory();
  };

  const totalPages = Math.ceil(total / limit) || 1;

  const STATUS_TABS: { label: string; value: string }[] = [
    { label: 'All Verifications', value: '' },
    { label: 'Verified', value: 'VERIFIED' },
    { label: 'Review Required', value: 'REVIEW' },
    { label: 'Suspicious', value: 'SUSPICIOUS' },
    { label: 'Not Registered', value: 'NOT_FOUND' },
  ];

  return (
    <div className="user-history-container">
      {/* Header */}
      <div className="user-history-header">
        <div>
          <span className="user-history-eyebrow">MEDVERIFY / PERSONAL ACTIVITY</span>
          <h1 className="user-history-title">My Verification History</h1>
          <p className="user-history-subtitle">
            All medicines verified using your personal account. Records are securely timestamped and read-only.
          </p>
        </div>

        <Link to="/app/scanner" className="user-history-new-scan-btn">
          Verify Another Medicine
        </Link>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="user-history-toolbar">
        <form onSubmit={handleSearchSubmit} className="user-history-search-form">
          <Search size={16} className="user-history-search-icon" />
          <input
            type="text"
            placeholder="Search by product name, barcode, or batch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="user-history-search-input"
          />
          <button type="submit" className="user-history-search-btn">
            Search
          </button>
        </form>

        <div className="user-history-status-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`user-history-tab-btn ${statusFilter === tab.value ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results Content */}
      {loading ? (
        <div className="user-history-loading-box">
          <div className="user-history-spinner" />
          <p>Retrieving your personal verification history...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="user-history-empty-box">
          <FileText size={42} className="user-history-empty-icon" />
          <h3>No records found</h3>
          <p>
            {search || statusFilter
              ? 'No verifications match the selected search or status filter.'
              : 'You have not scanned any medicines with this account yet.'}
          </p>
          {(search || statusFilter) && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setPage(1);
              }}
              className="user-history-clear-filter-btn"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="user-history-table-card">
          <div className="user-history-table-wrap">
            <table className="user-history-table">
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>MEDICINE SPECIMEN</th>
                  <th>MANUFACTURER</th>
                  <th>RAW IDENTIFIER</th>
                  <th>TIMESTAMP</th>
                  <th style={{ textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.verification_id}
                    onClick={() => navigate(`/app/result/${row.verification_id}`)}
                    className="user-history-row"
                  >
                    <td>
                      <StatusBadge status={row.status} size="sm" />
                    </td>
                    <td>
                      <div className="user-history-medicine-cell">
                        <span className="user-history-product-name">
                          {row.product_name || 'Specimen ' + row.verification_id.slice(-6)}
                        </span>
                        <span className="user-history-verif-id">ID: {row.verification_id}</span>
                      </div>
                    </td>
                    <td>
                      <span className="user-history-mfr">{row.manufacturer || 'Unspecified'}</span>
                    </td>
                    <td>
                      <code className="user-history-code">{row.raw_identifier}</code>
                    </td>
                    <td>
                      <span className="user-history-time">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : 'N/A'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/app/result/${row.verification_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="user-history-inspect-btn"
                      >
                        Inspect Result
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="user-history-pagination">
            <div className="user-history-pagination-info">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} records
            </div>

            <div className="user-history-pagination-controls">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="user-history-page-btn"
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              <span className="user-history-page-num">
                Page {page} of {totalPages}
              </span>

              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="user-history-page-btn"
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserHistory;
