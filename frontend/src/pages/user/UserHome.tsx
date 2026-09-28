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
  Camera,
  Image as ImageIcon,
  PenLine,
  Package,
  Pill,
  Heart,
} from 'lucide-react';
import { Link, useNavigate } from '../../router';
import { getUserStats, getUserRecent, getStoredUser, getCabinet } from '../../api/client';
import type { UserStats, CabinetEntry } from '../../types';
import StatusBadge from '../../components/ui/StatusBadge';

export const UserHome: React.FC = () => {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [cabinetCount, setCabinetCount] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getUserStats(),
      getUserRecent(6),
      getCabinet().catch(() => []),
    ])
      .then(([s, r, cabinet]) => {
        if (mounted) {
          setStats(s);
          setRecent(r.recent || []);
          setCabinetCount(Array.isArray(cabinet) ? cabinet.length : 0);

          // Count medicines expiring within 30 days
          if (Array.isArray(cabinet)) {
            const now = new Date();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            const expiring = cabinet.filter((c: CabinetEntry) => {
              if (!c.expiry_date) return false;
              try {
                const exp = new Date(c.expiry_date);
                const diff = exp.getTime() - now.getTime();
                return diff > 0 && diff < thirtyDays;
              } catch {
                return false;
              }
            });
            setExpiringCount(expiring.length);
          }

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

        <h1 className="user-home-title">VERIFY YOUR MEDICINE</h1>
        <p className="user-home-subtitle">
          Choose how you'd like to verify your medicine against the trusted pharmaceutical registry.
        </p>

        {/* 3-Method Verification Hub */}
        <div className="verify-hub-grid">
          {/* Method 1: Scan Code */}
          <Link to="/app/scanner" className="verify-hub-card verify-hub-card--scan">
            <div className="verify-hub-icon-wrap verify-hub-icon--scan">
              <ScanLine size={28} strokeWidth={1.5} />
            </div>
            <div className="verify-hub-card-body">
              <h3 className="verify-hub-card-title">Scan Code</h3>
              <p className="verify-hub-card-desc">
                Open camera to scan QR, DataMatrix, or barcode on medicine packaging.
              </p>
            </div>
            <div className="verify-hub-card-footer">
              <span className="verify-hub-method-tag">QR · DataMatrix · EAN</span>
              <ArrowRight size={16} className="verify-hub-arrow" />
            </div>
          </Link>

          {/* Method 2: Scan Packaging (OCR) */}
          <Link to="/app/scanner?mode=packaging" className="verify-hub-card verify-hub-card--packaging">
            <div className="verify-hub-icon-wrap verify-hub-icon--packaging">
              <Camera size={28} strokeWidth={1.5} />
            </div>
            <div className="verify-hub-card-body">
              <h3 className="verify-hub-card-title">Scan Packaging</h3>
              <p className="verify-hub-card-desc">
                Photograph the medicine label and extract details with optical text recognition.
              </p>
            </div>
            <div className="verify-hub-card-footer">
              <span className="verify-hub-method-tag">OCR · Label · Box</span>
              <ArrowRight size={16} className="verify-hub-arrow" />
            </div>
          </Link>

          {/* Method 3: Manual Entry */}
          <Link to="/app/scanner?mode=manual" className="verify-hub-card verify-hub-card--manual">
            <div className="verify-hub-icon-wrap verify-hub-icon--manual">
              <PenLine size={28} strokeWidth={1.5} />
            </div>
            <div className="verify-hub-card-body">
              <h3 className="verify-hub-card-title">Enter Details</h3>
              <p className="verify-hub-card-desc">
                Type in the GTIN, batch number, or GS1 barcode string from the packaging.
              </p>
            </div>
            <div className="verify-hub-card-footer">
              <span className="verify-hub-method-tag">GTIN · Batch · Serial</span>
              <ArrowRight size={16} className="verify-hub-arrow" />
            </div>
          </Link>
        </div>
      </section>

      {/* Quick Access Cards */}
      <section className="user-home-quick-access">
        <Link to="/app/cabinet" className="quick-access-card">
          <div className="quick-access-icon-wrap quick-access--cabinet">
            <Package size={20} />
          </div>
          <div className="quick-access-info">
            <span className="quick-access-title">Medicine Cabinet</span>
            <span className="quick-access-value">
              {loading ? '—' : `${cabinetCount} saved`}
              {expiringCount > 0 && (
                <span className="quick-access-alert"> · {expiringCount} expiring soon</span>
              )}
            </span>
          </div>
          <ChevronRight size={16} className="quick-access-arrow" />
        </Link>

        <Link to="/app/history" className="quick-access-card">
          <div className="quick-access-icon-wrap quick-access--history">
            <Clock size={20} />
          </div>
          <div className="quick-access-info">
            <span className="quick-access-title">My Activity</span>
            <span className="quick-access-value">
              {loading ? '—' : `${stats?.total_verifications ?? 0} total verifications`}
            </span>
          </div>
          <ChevronRight size={16} className="quick-access-arrow" />
        </Link>
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
            <p>Ready to verify your first medicine? Click "Scan Code" or enter the packaging code manually.</p>
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
