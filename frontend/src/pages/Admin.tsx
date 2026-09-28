import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  RefreshCw,
  Search,
  Filter,
  Trash2,
  ExternalLink,
  ArrowRight,
  Database,
  Activity,
  Layers,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  QrCode,
  Package,
  Sparkles,
} from 'lucide-react';
import { getAnalytics, getAdminMedicines, deleteMedicine } from '../api/client';
import type { AnalyticsData, Medicine, VerificationListItem, VerificationStatus } from '../types';
import { pageVariants, fadeUp, staggerContainer } from '../animations/motion';
import { Link } from '../router';
import AdminAIAnalystModal from '../components/ai/AdminAIAnalystModal';

/* Redesigned Command Center Components */
import HealthGauge from '../components/ui/HealthGauge';
import ActiveInvestigationsQueue from '../components/ui/ActiveInvestigationsQueue';
import ActivityGraph from '../components/ui/ActivityGraph';
import EventTimeline from '../components/ui/EventTimeline';
import ForensicCertificatePanel from '../components/ui/ForensicCertificatePanel';
import InspectionDrawer from '../components/ui/InspectionDrawer';
import AnimatedNumber from '../components/ui/AnimatedNumber';
import StatusBadge from '../components/ui/StatusBadge';

export default function Admin() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Active filter for Event Timeline from Investigations Queue
  const [activeFilter, setActiveFilter] = useState<'ALL' | VerificationStatus>('ALL');

  // Selected item for slide-over Inspection Drawer
  const [selectedInspection, setSelectedInspection] = useState<VerificationListItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // AI Verification Analyst Modal
  const [isAnalystOpen, setIsAnalystOpen] = useState(false);

  // Registry search query
  const [registryQuery, setRegistryQuery] = useState('');

  const loadData = async () => {
    try {
      const [a, m] = await Promise.all([getAnalytics(), getAdminMedicines()]);
      setAnalytics(a);
      setMedicines(m);
    } catch (e) {
      console.error('Failed to load admin analytics:', e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleInspect = (item: VerificationListItem) => {
    setSelectedInspection(item);
    setIsDrawerOpen(true);
  };

  const handleDeleteMedicine = async (id: string, name: string) => {
    if (!window.confirm(`Deactivate medicine record for "${name}"?`)) return;
    try {
      await deleteMedicine(id);
      await loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const total = analytics?.total_verifications || 0;
  const verifiedCount = analytics?.status_breakdown?.VERIFIED || 0;
  const suspiciousCount = analytics?.status_breakdown?.SUSPICIOUS || 0;
  const reviewCount = analytics?.status_breakdown?.REVIEW || 0;
  const notFoundCount = analytics?.status_breakdown?.NOT_FOUND || 0;
  const verifiedRate = total > 0 ? ((verifiedCount / total) * 100).toFixed(1) : '100';

  const recentVerifications = analytics?.recent_verifications || [];
  const latestSpecimen = recentVerifications[0] || null;

  const filteredMedicines = useMemo(() => {
    if (!registryQuery) return medicines.slice(0, 8);
    const q = registryQuery.toLowerCase();
    return medicines
      .filter(
        (m) =>
          m.product_name.toLowerCase().includes(q) ||
          m.product_identifier.includes(q) ||
          m.batch_number.toLowerCase().includes(q) ||
          m.manufacturer?.name?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [medicines, registryQuery]);

  if (loading) {
    return (
      <div className="command-center-loading-state">
        <div className="telemetry-spinner" />
        <h3 className="command-loading-title">INITIALIZING COMMAND CONSOLE</h3>
        <p className="command-loading-desc">
          Connecting to distributed verification nodes & streaming real-time ledger telemetry...
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="command-center-layout"
    >
      {/* 1. OPEN EDITORIAL HERO & PRIMARY ACTION (NO CARD BORDER) */}
      <section className="command-editorial-header">
        <div className="command-editorial-header__main">
          <span className="command-eyebrow">DIGITAL MEDICINE VERIFICATION PLATFORM</span>
          <h1 className="command-headline">Verification Command Center</h1>
          <p className="command-subhead">
            Continuous forensic ledger analysis, automated anti-counterfeit anomaly triage, and
            cryptographically authorized pharmaceutical registry monitoring.
          </p>

          <div className="command-header-actions">
            {/* AI Verification Analyst Button */}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setIsAnalystOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
                borderColor: 'transparent',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(180, 83, 9, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Launch AI Verification Analyst for automated trend synthesis"
            >
              <Sparkles size={13} />
              <span>AI Verification Analyst</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw size={13} className={isRefreshing ? 'telemetry-spinner' : ''} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Telemetry'}</span>
            </button>
            <span className="command-sync-stamp">
              Last synced:{' '}
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* PRIMARY ACTION BLOCK: SCAN A MEDICINE */}
        <div className="command-scanner-entry-card">
          <div className="scanner-entry-lead">
            <div className="scanner-entry-icon-wrap">
              <ScanLine size={24} strokeWidth={2.2} />
            </div>
            <div>
              <span className="scanner-entry-eyebrow">PRIMARY OPERATIONAL ACTION</span>
              <h3 className="scanner-entry-title">Authenticate Medicine</h3>
              <p className="scanner-entry-text">
                Optical GS1 DataMatrix, 2D QR, and barcode cryptographic evaluation.
              </p>
            </div>
          </div>
          <Link to="/app/scanner" className="btn btn-primary scanner-entry-cta">
            <QrCode size={15} />
            <span>Open Precision Scanner</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* 2. DOMINANT PRIMARY METRIC & LIVE OPERATIONAL ACTIVITY SURFACE */}
      <section className="command-telemetry-surface">
        <div className="dominant-metric-banner">
          <div className="dominant-metric-group">
            <span className="dominant-metric-label">LIVE VERIFICATION ACTIVITY</span>
            <div className="dominant-metric-number-row">
              <h2 className="dominant-metric-value">
                <AnimatedNumber value={total} />
              </h2>
              <div className="dominant-metric-badge">
                <TrendingUp size={13} />
                <span>{verifiedRate}% Verified Authenticity</span>
              </div>
            </div>
            <p className="dominant-metric-context">
              Real-time inspection events recorded across hospital dispensaries, licensed retail
              pharmacies, and public safety verification endpoints.
            </p>
          </div>

          <div className="supporting-stats-strip">
            <div className="strip-stat">
              <span className="strip-stat__label">VERIFIED PACKAGES</span>
              <span className="strip-stat__val font-mono">
                <AnimatedNumber value={verifiedCount} />
              </span>
            </div>
            <div className="strip-stat-divider" />
            <div className="strip-stat">
              <span className="strip-stat__label">ANOMALIES FLAGGED</span>
              <span className="strip-stat__val font-mono" style={{ color: 'var(--color-review-text)' }}>
                <AnimatedNumber value={suspiciousCount + reviewCount} />
              </span>
            </div>
            <div className="strip-stat-divider" />
            <div className="strip-stat">
              <span className="strip-stat__label">AUTHORIZED SKUS</span>
              <span className="strip-stat__val font-mono">
                <AnimatedNumber value={analytics?.active_medicines || medicines.length} />
              </span>
            </div>
          </div>
        </div>

        {/* Operational Activity Graph */}
        <ActivityGraph
          verifications={recentVerifications}
          totalEvents={total}
        />
      </section>

      {/* 3. VERIFICATION HEALTH & ACTIVE INVESTIGATIONS QUEUE (2-COL) */}
      <section className="command-two-col-grid">
        <HealthGauge
          score={98}
          registryStatus="Operational & Signed"
          engineStatus="Active (6-Factor Model)"
          apiStatus="Low Latency (24ms)"
        />

        <ActiveInvestigationsQueue
          suspiciousCount={suspiciousCount}
          reviewCount={reviewCount}
          notFoundCount={notFoundCount}
          activeFilter={activeFilter}
          onFilterChange={(st) => setActiveFilter(st)}
        />
      </section>

      {/* 4. FORENSIC EVENT TIMELINE & LATEST SPECIMEN DOSSIER (2-COL) */}
      <section className="command-forensic-split">
        {/* Timeline of events with live filter */}
        <div className="command-forensic-split__timeline">
          <EventTimeline
            events={recentVerifications}
            onSelectEvent={handleInspect}
            activeFilter={activeFilter}
          />
        </div>

        {/* Latest specimen forensic certificate */}
        <div className="command-forensic-split__specimen">
          <ForensicCertificatePanel
            latestItem={latestSpecimen}
            onInspect={handleInspect}
          />
        </div>
      </section>

      {/* 5. AUTHORIZED REGISTRY INTEGRITY CATALOG (CONCISE, EDITORIAL TABLE) */}
      <section className="command-registry-section">
        <div className="command-registry-header">
          <div>
            <span className="command-eyebrow">REGISTRY INTEGRITY</span>
            <h3 className="command-section-title">Authorized Medicine Master Ledger</h3>
          </div>
          <div className="command-registry-actions">
            <div className="registry-search-wrap">
              <Search size={14} className="registry-search-icon" />
              <input
                type="text"
                placeholder="Filter by product name, GTIN, batch..."
                value={registryQuery}
                onChange={(e) => setRegistryQuery(e.target.value)}
                className="registry-search-input"
              />
            </div>
            <Link to="/app/registry" className="btn btn-secondary btn-sm">
              <span>View All ({medicines.length})</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        <div className="command-registry-table-wrapper">
          <table className="command-table">
            <thead>
              <tr>
                <th>Product Specimen</th>
                <th>GTIN Identifier</th>
                <th>Batch Reference</th>
                <th>Manufacturer Entity</th>
                <th>Ledger Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMedicines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="command-table-empty">
                    No authorized medicine records match your search criteria.
                  </td>
                </tr>
              ) : (
                filteredMedicines.map((med) => (
                  <tr key={med.id}>
                    <td>
                      <div className="table-product-title">{med.product_name}</div>
                      <div className="table-product-meta font-mono">
                        {med.dosage || 'Standard Dosage'} • {med.package_size || 'Unit Pack'}
                      </div>
                    </td>
                    <td className="font-mono table-code">{med.product_identifier}</td>
                    <td className="font-mono table-code">{med.batch_number}</td>
                    <td>
                      <span className="table-mfr-name">
                        {med.manufacturer?.name || 'Authorized Lab'}
                      </span>
                    </td>
                    <td>
                      <StatusBadge
                        status={med.status === 'active' ? 'VERIFIED' : 'NOT_FOUND'}
                        size="sm"
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => handleDeleteMedicine(med.id, med.product_name)}
                        title="Deactivate registry record"
                        aria-label={`Deactivate record for ${med.product_name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Slide-over Inspection Drawer */}
      <InspectionDrawer
        item={selectedInspection}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      {/* AI Verification Analyst Modal */}
      <AdminAIAnalystModal
        isOpen={isAnalystOpen}
        onClose={() => setIsAnalystOpen(false)}
      />
    </motion.div>
  );
}
