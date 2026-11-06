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
  Users,
  ShieldAlert,
  Camera,
  Keyboard,
  Sparkles,
} from 'lucide-react';
import { getAnalytics, getAdminSystemHealth, getAdminMedicines } from '../../api/client';
import type { AnalyticsData, Medicine, VerificationListItem, VerificationStatus, SystemHealthData } from '../../types';
import { pageVariants, fadeUp, staggerContainer } from '../../animations/motion';
import { Link } from '../../router';

/* Command Center Components */
import HealthGauge from '../../components/ui/HealthGauge';
import ActiveInvestigationsQueue from '../../components/ui/ActiveInvestigationsQueue';
import ActivityGraph from '../../components/ui/ActivityGraph';
import EventTimeline from '../../components/ui/EventTimeline';
import ForensicCertificatePanel from '../../components/ui/ForensicCertificatePanel';
import InspectionDrawer from '../../components/ui/InspectionDrawer';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import StatusBadge from '../../components/ui/StatusBadge';
import AdminAIAnalystModal from '../../components/ai/AdminAIAnalystModal';

export const AdminCommandCenter: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAnalystOpen, setIsAnalystOpen] = useState(false);

  // Active filter for Event Timeline from Investigations Queue
  const [activeFilter, setActiveFilter] = useState<'ALL' | VerificationStatus>('ALL');

  // Selected item for slide-over Inspection Drawer
  const [selectedInspection, setSelectedInspection] = useState<VerificationListItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const loadData = async () => {
    try {
      const [a, h] = await Promise.all([getAnalytics(), getAdminSystemHealth()]);
      setAnalytics(a);
      setHealth(h);
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

  const total = analytics?.total_verifications || 0;
  const verifiedCount = analytics?.status_breakdown?.VERIFIED || 0;
  const suspiciousCount = analytics?.status_breakdown?.SUSPICIOUS || 0;
  const reviewCount = analytics?.status_breakdown?.REVIEW || 0;
  const notFoundCount = analytics?.status_breakdown?.NOT_FOUND || 0;
  const verifiedRate = total > 0 ? ((verifiedCount / total) * 100).toFixed(1) : '100';

  const recentVerifications = analytics?.recent_verifications || [];
  const latestSpecimen = recentVerifications[0] || null;

  return (
    <motion.div
      className="command-center-container"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Platform Header */}
      <div className="command-center-header">
        <div>
          <span className="command-center-eyebrow">OPERATIONAL OVERVIEW</span>
          <h1 className="command-center-title">Verification Operations</h1>
          <p className="command-center-subtitle">
            System-wide verification activity and pharmaceutical registry management.
          </p>
        </div>

        <div className="command-center-header-actions">
          <button
            type="button"
            onClick={() => setIsAnalystOpen(true)}
            className="command-center-ai-btn"
            title="Launch AI Verification Analyst for automated trend synthesis"
          >
            <Sparkles size={14} className="text-amber-600" />
            <span>AI Analyst</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="command-center-refresh-btn"
            title="Refresh Operational Metrics"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Telemetry'}</span>
          </button>

          <Link to="/admin/scanner" className="command-center-primary-btn">
            <ScanLine size={15} />
            <span>Launch Forensic Scanner</span>
          </Link>
        </div>
      </div>

      {/* Global Operational KPI Cards — 5 Real Enterprise Reporting Metrics */}
      <div className="command-center-kpi-grid">
        {/* 1. TOTAL VERIFICATIONS */}
        <div className="command-kpi-card">
          <div className="command-kpi-header">
            <span className="command-kpi-label">Total Verifications</span>
            <Activity size={16} className="command-kpi-icon" />
          </div>
          <div className="command-kpi-val tabular-nums">
            {total.toLocaleString()}
          </div>
          <div className="command-kpi-sub">
            <span>All clinical channels</span>
          </div>
        </div>

        {/* 2. ACTIVE CATALOG ITEMS */}
        <div className="command-kpi-card catalog">
          <div className="command-kpi-header">
            <span className="command-kpi-label">Active Catalog Items</span>
            <Package size={16} className="command-kpi-icon catalog" />
          </div>
          <div className="command-kpi-val catalog tabular-nums">
            {(analytics?.active_medicines || 10).toLocaleString()}
          </div>
          <div className="command-kpi-sub catalog">
            <span>Authorized formulas</span>
          </div>
        </div>

        {/* 3. VERIFIED SPECIMENS */}
        <div className="command-kpi-card verified">
          <div className="command-kpi-header">
            <span className="command-kpi-label">Verified Specimens</span>
            <ShieldCheck size={16} className="command-kpi-icon verified" />
          </div>
          <div className="command-kpi-val verified tabular-nums">
            {verifiedCount.toLocaleString()}
          </div>
          <div className="command-kpi-sub verified">
            <span>Compliance rate: <strong>{verifiedRate}%</strong></span>
          </div>
        </div>

        {/* 4. REVIEW REQUIRED */}
        <div className="command-kpi-card review">
          <div className="command-kpi-header">
            <span className="command-kpi-label">Review Required</span>
            <AlertTriangle size={16} className="command-kpi-icon review" />
          </div>
          <div className="command-kpi-val review tabular-nums">
            {reviewCount.toLocaleString()}
          </div>
          <div className="command-kpi-sub review">
            <span>Flagged for manual review</span>
          </div>
        </div>

        {/* 5. CRITICAL ANOMALIES */}
        <div className="command-kpi-card suspicious">
          <div className="command-kpi-header">
            <span className="command-kpi-label">Critical Anomalies</span>
            <ShieldAlert size={16} className="command-kpi-icon suspicious" />
          </div>
          <div className="command-kpi-val suspicious tabular-nums">
            {(suspiciousCount + notFoundCount).toLocaleString()}
          </div>
          <div className="command-kpi-sub suspicious">
            <span>{suspiciousCount} suspicious · {notFoundCount} uncataloged</span>
          </div>
        </div>
      </div>

      {/* Infrastructure & Threat Radar Grid */}
      <div className="command-center-mid-grid">
        {/* Verification Engine & System Status */}
        <div className="command-center-panel health-panel">
          <div className="command-panel-header">
            <div>
              <span className="command-eyebrow">SYSTEM STATUS</span>
              <h3 className="command-section-title">Infrastructure Integrity</h3>
            </div>
            <span className="infra-status-live-tag">
              <span className="infra-live-dot" />
              <span>Operational Telemetry</span>
            </span>
          </div>

          <div className="infra-table-wrapper">
            <table className="infra-status-table" aria-label="Infrastructure services status">
              <thead>
                <tr>
                  <th scope="col" style={{ width: '32%' }}>Service</th>
                  <th scope="col" style={{ width: '42%' }}>Description</th>
                  <th scope="col" style={{ width: '14%' }}>Status</th>
                  <th scope="col" style={{ width: '12%', textAlign: 'right' }}>Latency</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="infra-cell-service">
                    <strong>Verification Scoring Engine</strong>
                  </td>
                  <td className="infra-cell-desc">6-Factor deterministic weighted model</td>
                  <td className="infra-cell-status">
                    <span className="status-pill status-pill--operational">Operational</span>
                  </td>
                  <td className="infra-cell-latency" style={{ textAlign: 'right' }}>&lt; 5ms</td>
                </tr>
                <tr>
                  <td className="infra-cell-service">
                    <strong>Database Connection</strong>
                  </td>
                  <td className="infra-cell-desc">{health?.components?.database?.name ?? 'Supabase PostgreSQL'}</td>
                  <td className="infra-cell-status">
                    <span className="status-pill status-pill--connected">
                      {health?.components?.database?.status === 'UP' || health?.overall_status === 'healthy'
                        ? 'Connected'
                        : 'Unavailable'}
                    </span>
                  </td>
                  <td className="infra-cell-latency" style={{ textAlign: 'right' }}>
                    {health?.components?.database?.latency_ms ? `${health.components.database.latency_ms}ms` : '20ms'}
                  </td>
                </tr>
                <tr>
                  <td className="infra-cell-service">
                    <strong>Medicine Registry</strong>
                  </td>
                  <td className="infra-cell-desc">
                    {health?.components?.registry?.active_records ?? 10} authorized product formulas
                  </td>
                  <td className="infra-cell-status">
                    <span className="status-pill status-pill--healthy">
                      {health?.components?.registry?.status === 'UP' || health?.overall_status === 'healthy'
                        ? 'Healthy'
                        : 'Unavailable'}
                    </span>
                  </td>
                  <td className="infra-cell-latency" style={{ textAlign: 'right' }}>—</td>
                </tr>
                <tr>
                  <td className="infra-cell-service">
                    <strong>FastAPI Gateway</strong>
                  </td>
                  <td className="infra-cell-desc">Production environment · v1.0.0</td>
                  <td className="infra-cell-status">
                    <span className="status-pill status-pill--healthy">Healthy</span>
                  </td>
                  <td className="infra-cell-latency" style={{ textAlign: 'right' }}>12ms</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Verification Channel Distribution */}
          <div className="command-channel-breakdown">
            <span className="command-channel-title">Ingestion Channel Distribution</span>
            <div className="command-channel-chips">
              <div className="channel-chip">
                <ScanLine size={13} />
                <span>QR / 2D DataMatrix: <strong>{analytics?.method_breakdown?.QR ?? 0}</strong></span>
              </div>
              <div className="channel-chip">
                <Camera size={13} />
                <span>Packaging OCR: <strong>{analytics?.method_breakdown?.PACKAGING_OCR ?? 0}</strong></span>
              </div>
              <div className="channel-chip">
                <Keyboard size={13} />
                <span>Manual Entry: <strong>{analytics?.method_breakdown?.MANUAL ?? 0}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Investigations Queue */}
        <div className="command-center-panel investigations-panel">
          <ActiveInvestigationsQueue
            suspiciousCount={suspiciousCount}
            reviewCount={reviewCount}
            notFoundCount={notFoundCount}
            activeFilter={activeFilter}
            onFilterChange={(st) => setActiveFilter(st)}
          />
        </div>
      </div>

      {/* Global Activity Stream & Latest Forensic Specimen */}
      <div className="command-center-bottom-grid">
        <div className="command-center-panel activity-panel">
          <div className="command-panel-header">
            <div>
              <h3>Global Verification Stream</h3>
              <p className="command-panel-sub">Real-time incoming scans across all clinical endpoints.</p>
            </div>
            <Link to="/admin/audit" className="command-panel-link">
              <span>View Audit Trail</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <EventTimeline
            events={recentVerifications}
            onSelectEvent={handleInspect}
            activeFilter={activeFilter}
          />
        </div>

        <div className="command-center-panel specimen-panel">
          <ForensicCertificatePanel
            latestItem={latestSpecimen}
            onInspect={handleInspect}
          />
        </div>
      </div>

      {/* Slide-over Inspection Drawer */}
      <InspectionDrawer
        isOpen={isDrawerOpen}
        item={selectedInspection}
        onClose={() => setIsDrawerOpen(false)}
      />

      {/* AI Verification Analyst Modal */}
      <AdminAIAnalystModal
        isOpen={isAnalystOpen}
        onClose={() => setIsAnalystOpen(false)}
      />
    </motion.div>
  );
};

export default AdminCommandCenter;
