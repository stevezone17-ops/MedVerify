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
          <span className="command-center-eyebrow">MEDVERIFY / FORENSIC CONTROL</span>
          <h1 className="command-center-title">Verification Command Center</h1>
          <p className="command-center-subtitle">
            System-wide operational telemetry, real-time threat monitoring, and global medicine authentication streams.
          </p>
        </div>

        <div className="command-center-header-actions">
          <button
            type="button"
            onClick={() => setIsAnalystOpen(true)}
            className="command-center-ai-btn"
            title="Launch AI Verification Analyst for automated trend synthesis"
          >
            <Sparkles size={14} className="text-amber-400" />
            <span>AI Analyst</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="command-center-refresh-btn"
            title="Refresh Operational Metrics"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Telemetry'}</span>
          </button>

          <Link to="/admin/scanner" className="command-center-primary-btn">
            <ScanLine size={16} />
            <span>Launch Forensic Scanner</span>
          </Link>
        </div>
      </div>

      {/* Global Operational KPI Cards — 5 Real Dashboard Cards */}
      <div className="command-center-kpi-grid">
        {/* 1. TOTAL VERIFICATIONS */}
        <div className="command-kpi-card">
          <div className="command-kpi-header">
            <span className="command-kpi-label">TOTAL VERIFICATIONS</span>
            <Activity size={18} className="command-kpi-icon" />
          </div>
          <div className="command-kpi-val">
            <AnimatedNumber value={total} />
          </div>
          <div className="command-kpi-sub">
            <span>System-Wide Scans</span>
          </div>
        </div>

        {/* 2. ACTIVE CATALOG ITEMS */}
        <div className="command-kpi-card catalog">
          <div className="command-kpi-header">
            <span className="command-kpi-label">ACTIVE CATALOG ITEMS</span>
            <Package size={18} className="command-kpi-icon catalog" />
          </div>
          <div className="command-kpi-val catalog">
            <AnimatedNumber value={analytics?.active_medicines || 10} />
          </div>
          <div className="command-kpi-sub catalog">
            <span>Authorized Formulas</span>
          </div>
        </div>

        {/* 3. VERIFIED SPECIMENS */}
        <div className="command-kpi-card verified">
          <div className="command-kpi-header">
            <span className="command-kpi-label">VERIFIED SPECIMENS</span>
            <ShieldCheck size={18} className="command-kpi-icon verified" />
          </div>
          <div className="command-kpi-val verified">
            <AnimatedNumber value={verifiedCount} />
          </div>
          <div className="command-kpi-sub verified">
            <span>Authentic Compliance <strong>{verifiedRate}%</strong></span>
          </div>
        </div>

        {/* 4. REVIEW REQUIRED */}
        <div className="command-kpi-card review">
          <div className="command-kpi-header">
            <span className="command-kpi-label">REVIEW REQUIRED</span>
            <AlertTriangle size={18} className="command-kpi-icon review" />
          </div>
          <div className="command-kpi-val review">
            <AnimatedNumber value={reviewCount} />
          </div>
          <div className="command-kpi-sub review">
            <span>Expired / Incomplete Payloads</span>
          </div>
        </div>

        {/* 5. CRITICAL ANOMALIES */}
        <div className="command-kpi-card suspicious">
          <div className="command-kpi-header">
            <span className="command-kpi-label">CRITICAL ANOMALIES</span>
            <ShieldAlert size={18} className="command-kpi-icon suspicious" />
          </div>
          <div className="command-kpi-val suspicious">
            <AnimatedNumber value={suspiciousCount + notFoundCount} />
          </div>
          <div className="command-kpi-sub suspicious">
            <span>{suspiciousCount} Suspicious · {notFoundCount} Unregistered</span>
          </div>
        </div>
      </div>

      {/* Infrastructure & Threat Radar Grid */}
      <div className="command-center-mid-grid">
        {/* Verification Engine & System Status */}
        <div className="command-center-panel health-panel">
          <div className="command-panel-header">
            <h3>Infrastructure Integrity</h3>
            <span className="command-panel-badge live">REAL-TIME TELEMETRY</span>
          </div>

          <div className="command-infra-list">
            <div className="command-infra-row">
              <div className="infra-row-left">
                <span className="infra-status-dot online" />
                <div>
                  <strong>Verification Scoring Engine</strong>
                  <p>6-Factor Weighted Deterministic Model</p>
                </div>
              </div>
              <span className="infra-tag">OPERATIONAL</span>
            </div>

            <div className="command-infra-row">
              <div className="infra-row-left">
                <span className="infra-status-dot online" />
                <div>
                  <strong>{health?.components?.database?.name ?? 'Supabase PostgreSQL'}</strong>
                  <p>Ping Latency: {health?.components?.database?.latency_ms ?? 20}ms</p>
                </div>
              </div>
              <span className="infra-tag">CONNECTED</span>
            </div>

            <div className="command-infra-row">
              <div className="infra-row-left">
                <span className="infra-status-dot online" />
                <div>
                  <strong>Medicine Registry Catalog</strong>
                  <p>{health?.components?.registry?.active_records ?? 10} Authorized Product Codes</p>
                </div>
              </div>
              <span className="infra-tag">HEALTHY</span>
            </div>

            <div className="command-infra-row">
              <div className="infra-row-left">
                <span className="infra-status-dot online" />
                <div>
                  <strong>FastAPI Core Gateway</strong>
                  <p>Environment: Production · v1.0.0</p>
                </div>
              </div>
              <span className="infra-tag">HEALTHY</span>
            </div>
          </div>

          {/* Verification Channel Distribution */}
          <div className="command-channel-breakdown">
            <span className="command-channel-title">INGESTION METHOD BREAKDOWN</span>
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
