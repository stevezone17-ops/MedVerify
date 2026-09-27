import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ScanLine,
  Keyboard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  Sparkles,
  Info,
} from 'lucide-react';
import { Link, useNavigate } from '../../router';
import { getUserStats, getUserRecent, getStoredUser } from '../../api/client';
import type { UserStats } from '../../types';
import StatusBadge from '../../components/ui/StatusBadge';

export const UserHome: React.FC = () => {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    Promise.all([getUserStats(), getUserRecent(6)])
      .then(([s, r]) => {
        if (mounted) {
          setStats(s);
          setRecent(r.recent || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load user home data:', err);
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const formatRelativeTime = (timestamp?: string) => {
    if (!timestamp) return 'Recently';
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="user-home-container">
      {/* Hero Section */}
      <section className="user-home-hero">
        <div className="user-home-hero-badge">
          <Sparkles size={14} className="user-home-hero-sparkle" />
          <span>OFFICIAL MEDICINE VERIFICATION</span>
        </div>

        <h1 className="user-home-title">VERIFY A MEDICINE</h1>
        <p className="user-home-subtitle">
          Scan a QR code, DataMatrix or barcode to verify medicine identity against the trusted pharmaceutical registry.
        </p>

        {/* Primary Call-to-Actions */}
        <div className="user-home-actions">
          <Link to="/app/scanner" className="user-home-btn-primary">
            <ScanLine size={20} className="user-btn-icon" />
            <div className="user-btn-text-group">
              <span className="user-btn-main">SCAN A MEDICINE</span>
              <span className="user-btn-sub">Open camera to read packaging barcode</span>
            </div>
            <ArrowRight size={18} className="user-btn-arrow" />
          </Link>

          <Link to="/app/scanner?mode=manual" className="user-home-btn-secondary">
            <Keyboard size={18} />
            <span>ENTER CODE MANUALLY</span>
          </Link>
        </div>
      </section>

      {/* Personal Verification Metrics */}
      <section className="user-home-stats-section" aria-label="Personal Verification Statistics">
        <div className="user-home-section-header">
          <h2 className="user-home-section-title">My Verification Summary</h2>
          <span className="user-home-section-note">Personal scans by {user?.name || 'you'}</span>
        </div>

        <div className="user-home-stats-grid">
          <div className="user-stat-card total">
            <div className="user-stat-header">
              <span className="user-stat-label">My Verifications</span>
              <Clock size={16} className="user-stat-icon" />
            </div>
            <div className="user-stat-value">{loading ? '—' : stats?.total_verifications ?? 0}</div>
            <div className="user-stat-meta">Total medicine packages checked</div>
          </div>

          <div className="user-stat-card verified">
            <div className="user-stat-header">
              <span className="user-stat-label">Verified Authentic</span>
              <CheckCircle2 size={16} className="user-stat-icon verified" />
            </div>
            <div className="user-stat-value verified">{loading ? '—' : stats?.verified_count ?? 0}</div>
            <div className="user-stat-meta">Passed all 6 integrity checks</div>
          </div>

          <div className="user-stat-card review">
            <div className="user-stat-header">
              <span className="user-stat-label">Review Required</span>
              <AlertTriangle size={16} className="user-stat-icon review" />
            </div>
            <div className="user-stat-value review">{loading ? '—' : stats?.review_count ?? 0}</div>
            <div className="user-stat-meta">Expired or missing parameters</div>
          </div>

          <div className="user-stat-card suspicious">
            <div className="user-stat-header">
              <span className="user-stat-label">Not Registered / Flagged</span>
              <ShieldAlert size={16} className="user-stat-icon suspicious" />
            </div>
            <div className="user-stat-value suspicious">
              {loading ? '—' : (stats?.suspicious_count ?? 0) + (stats?.not_found_count ?? 0)}
            </div>
            <div className="user-stat-meta">Unknown or anomaly batch detected</div>
          </div>
        </div>
      </section>

      {/* Recent Verifications Feed */}
      <section className="user-home-recent-section">
        <div className="user-home-section-header">
          <div>
            <h2 className="user-home-section-title">Recent Verifications</h2>
            <p className="user-home-section-desc">Your personal verification history log.</p>
          </div>
          <Link to="/app/history" className="user-home-view-all-link">
            <span>View Complete History</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="user-home-loading-box">Loading recent verification activity...</div>
        ) : recent.length === 0 ? (
          <div className="user-home-empty-box">
            <ScanLine size={36} className="user-home-empty-icon" />
            <h3>No verification scans yet</h3>
            <p>Ready to verify your first medicine? Click "Scan a Medicine" or enter the packaging code manually.</p>
            <Link to="/app/scanner" className="user-home-empty-cta">
              Scan Medicine Now
            </Link>
          </div>
        ) : (
          <div className="user-home-recent-list">
            {recent.map((item) => (
              <div
                key={item.verification_id}
                className="user-home-recent-item"
                onClick={() => navigate(`/app/result/${item.verification_id}`)}
              >
                <div className="user-home-recent-left">
                  <div className="user-home-recent-status-col">
                    <StatusBadge status={item.status} size="sm" />
                  </div>
                  <div className="user-home-recent-info">
                    <span className="user-home-recent-name">{item.product_name || 'Medicine Specimen'}</span>
                    <span className="user-home-recent-details">
                      {item.manufacturer} · Batch: {item.batch_number || 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="user-home-recent-right">
                  <span className="user-home-recent-time">{formatRelativeTime(item.created_at)}</span>
                  <ChevronRight size={16} className="user-home-recent-arrow" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* How It Protects You Section */}
      <section className="user-home-guide-strip">
        <div className="user-guide-step">
          <div className="user-guide-num">01</div>
          <div className="user-guide-text">
            <strong>Scan Packaging</strong>
            <p>Point your camera at the 2D DataMatrix or GS1 barcode on the medicine blister or box.</p>
          </div>
        </div>

        <div className="user-guide-step">
          <div className="user-guide-num">02</div>
          <div className="user-guide-text">
            <strong>Cryptographic Cross-Check</strong>
            <p>MedVerify checks manufacturer license, authorized batch numbers, and expiry date.</p>
          </div>
        </div>

        <div className="user-guide-step">
          <div className="user-guide-num">03</div>
          <div className="user-guide-text">
            <strong>Clear Decision</strong>
            <p>Receive an explainable verdict with full transparency before taking or dispensing medication.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default UserHome;
