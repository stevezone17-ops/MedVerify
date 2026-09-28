import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Pill,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  Edit3,
  Bell,
  BellOff,
  Plus,
  Search,
  ScanLine,
  ChevronRight,
  X,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { Link, useNavigate } from '../../router';
import { getCabinet, removeCabinetEntry, updateCabinetEntry } from '../../api/client';
import type { CabinetEntry } from '../../types';

type ExpiryStatus = 'expired' | 'expiring_soon' | 'valid' | 'unknown';

function getExpiryStatus(expiryDate?: string): ExpiryStatus {
  if (!expiryDate) return 'unknown';
  try {
    const exp = new Date(expiryDate);
    const now = new Date();
    const diffMs = exp.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 'expired';
    if (diffDays < 30) return 'expiring_soon';
    return 'valid';
  } catch {
    return 'unknown';
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Not specified';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function daysUntilExpiry(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const exp = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `Expired ${Math.abs(diffDays)} days ago`;
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    if (diffDays < 30) return `${diffDays} days left`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months left`;
    return `${Math.floor(diffDays / 365)} years left`;
  } catch {
    return '';
  }
}

export const UserCabinet: React.FC = () => {
  const [entries, setEntries] = useState<CabinetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'expired' | 'expiring_soon' | 'valid'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const navigate = useNavigate();

  const loadCabinet = useCallback(async () => {
    try {
      const data = await getCabinet();
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load cabinet:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCabinet();
  }, [loadCabinet]);

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this medicine from your cabinet?')) return;
    try {
      await removeCabinetEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Failed to remove cabinet entry:', err);
    }
  };

  const handleToggleReminder = async (entry: CabinetEntry) => {
    try {
      const updated = await updateCabinetEntry(entry.id, {
        reminder_enabled: !entry.reminder_enabled,
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, ...updated } : e)),
      );
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
    }
  };

  const startEdit = (entry: CabinetEntry) => {
    setEditingId(entry.id);
    setEditNickname(entry.nickname || '');
    setEditNotes(entry.notes || '');
  };

  const saveEdit = async (id: string) => {
    try {
      const updated = await updateCabinetEntry(id, {
        nickname: editNickname || undefined,
        notes: editNotes || undefined,
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updated } : e)),
      );
      setEditingId(null);
    } catch (err) {
      console.error('Failed to save edit:', err);
    }
  };

  const filteredEntries = entries.filter((e) => {
    const expStatus = getExpiryStatus(e.expiry_date);
    if (filter !== 'all' && expStatus !== filter) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const name = (e.nickname || e.product_name || '').toLowerCase();
      const mfr = (e.manufacturer || '').toLowerCase();
      const batch = (e.batch_number || '').toLowerCase();
      return name.includes(s) || mfr.includes(s) || batch.includes(s);
    }
    return true;
  });

  const expiredCount = entries.filter((e) => getExpiryStatus(e.expiry_date) === 'expired').length;
  const expiringCount = entries.filter((e) => getExpiryStatus(e.expiry_date) === 'expiring_soon').length;
  const validCount = entries.filter((e) => getExpiryStatus(e.expiry_date) === 'valid').length;

  return (
    <div className="cabinet-page-container">
      {/* Header */}
      <div className="cabinet-page-header">
        <div className="cabinet-header-left">
          <div className="cabinet-icon-badge">
            <Package size={24} />
          </div>
          <div>
            <h1 className="cabinet-page-title">Medicine Cabinet</h1>
            <p className="cabinet-page-subtitle">
              Your personal medicine vault. Track expiry dates, set reminders, and manage your verified medicines.
            </p>
          </div>
        </div>
        <Link to="/app/scanner" className="btn btn-primary cabinet-add-btn">
          <Plus size={16} />
          <span>Verify & Add</span>
        </Link>
      </div>

      {/* Summary Badges */}
      <div className="cabinet-summary-badges">
        <button
          className={`cabinet-badge-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <Package size={14} />
          <span>All ({entries.length})</span>
        </button>
        <button
          className={`cabinet-badge-btn cabinet-badge--valid ${filter === 'valid' ? 'active' : ''}`}
          onClick={() => setFilter('valid')}
        >
          <CheckCircle2 size={14} />
          <span>Valid ({validCount})</span>
        </button>
        <button
          className={`cabinet-badge-btn cabinet-badge--expiring ${filter === 'expiring_soon' ? 'active' : ''}`}
          onClick={() => setFilter('expiring_soon')}
        >
          <Clock size={14} />
          <span>Expiring Soon ({expiringCount})</span>
        </button>
        <button
          className={`cabinet-badge-btn cabinet-badge--expired ${filter === 'expired' ? 'active' : ''}`}
          onClick={() => setFilter('expired')}
        >
          <AlertTriangle size={14} />
          <span>Expired ({expiredCount})</span>
        </button>
      </div>

      {/* Search */}
      <div className="cabinet-search-bar">
        <Search size={16} className="cabinet-search-icon" />
        <input
          type="text"
          placeholder="Search your medicines..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="cabinet-search-input"
        />
        {searchTerm && (
          <button className="cabinet-search-clear" onClick={() => setSearchTerm('')}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Medicine Grid */}
      {loading ? (
        <div className="cabinet-loading">
          <div className="telemetry-spinner" style={{ width: 32, height: 32 }} />
          <p>Loading your medicine cabinet...</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="cabinet-empty-state">
          {entries.length === 0 ? (
            <>
              <Package size={48} className="cabinet-empty-icon" />
              <h3>Your Medicine Cabinet is Empty</h3>
              <p>
                Verify a medicine and save it to your cabinet to track expiry dates and set reminders.
              </p>
              <Link to="/app/scanner" className="btn btn-primary btn-lg">
                <ScanLine size={18} />
                <span>Verify Your First Medicine</span>
              </Link>
            </>
          ) : (
            <>
              <Search size={36} className="cabinet-empty-icon" />
              <h3>No medicines match your filter</h3>
              <p>Try adjusting your search or filter criteria.</p>
              <button className="btn btn-secondary" onClick={() => { setFilter('all'); setSearchTerm(''); }}>
                Clear Filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="cabinet-grid">
          {filteredEntries.map((entry) => {
            const expStatus = getExpiryStatus(entry.expiry_date);
            const isEditing = editingId === entry.id;

            return (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`cabinet-card cabinet-card--${expStatus}`}
              >
                {/* Card Header */}
                <div className="cabinet-card-header">
                  <div className="cabinet-card-name-group">
                    {isEditing ? (
                      <input
                        type="text"
                        className="cabinet-edit-input font-mono"
                        value={editNickname}
                        onChange={(e) => setEditNickname(e.target.value)}
                        placeholder="Nickname..."
                        autoFocus
                      />
                    ) : (
                      <h3 className="cabinet-card-name">
                        {entry.nickname || entry.product_name || 'Unnamed Medicine'}
                      </h3>
                    )}
                    {entry.manufacturer && (
                      <span className="cabinet-card-manufacturer">{entry.manufacturer}</span>
                    )}
                  </div>

                  <div className={`cabinet-expiry-badge cabinet-expiry-badge--${expStatus}`}>
                    {expStatus === 'expired' && <AlertTriangle size={12} />}
                    {expStatus === 'expiring_soon' && <Clock size={12} />}
                    {expStatus === 'valid' && <CheckCircle2 size={12} />}
                    <span>
                      {expStatus === 'expired' ? 'EXPIRED' : expStatus === 'expiring_soon' ? 'EXPIRING SOON' : expStatus === 'valid' ? 'VALID' : 'NO DATE'}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="cabinet-card-body">
                  {entry.expiry_date && (
                    <div className="cabinet-field-row">
                      <Calendar size={13} />
                      <span className="cabinet-field-label">Expiry:</span>
                      <span className="cabinet-field-value font-mono">{formatDate(entry.expiry_date)}</span>
                      <span className={`cabinet-days-left cabinet-days-left--${expStatus}`}>
                        {daysUntilExpiry(entry.expiry_date)}
                      </span>
                    </div>
                  )}
                  {entry.batch_number && (
                    <div className="cabinet-field-row">
                      <Pill size={13} />
                      <span className="cabinet-field-label">Batch:</span>
                      <span className="cabinet-field-value font-mono">{entry.batch_number}</span>
                    </div>
                  )}

                  {isEditing && (
                    <div className="cabinet-edit-notes">
                      <textarea
                        className="cabinet-notes-textarea"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Personal notes..."
                        rows={2}
                      />
                    </div>
                  )}

                  {!isEditing && entry.notes && (
                    <div className="cabinet-notes-preview">
                      <em>{entry.notes}</em>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="cabinet-card-actions">
                  {isEditing ? (
                    <>
                      <button className="btn btn-primary btn-xs" onClick={() => saveEdit(entry.id)}>
                        <Save size={12} />
                        <span>Save</span>
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditingId(null)}>
                        <X size={12} />
                        <span>Cancel</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleToggleReminder(entry)}
                        title={entry.reminder_enabled ? 'Disable reminder' : 'Enable reminder'}
                      >
                        {entry.reminder_enabled ? <Bell size={13} /> : <BellOff size={13} />}
                        <span>{entry.reminder_enabled ? 'Remind' : 'No Remind'}</span>
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => startEdit(entry)}>
                        <Edit3 size={13} />
                        <span>Edit</span>
                      </button>
                      {entry.verification_id && (
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => navigate(`/app/result/${entry.verification_id}`)}
                        >
                          <ShieldCheck size={13} />
                          <span>Details</span>
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-xs cabinet-remove-btn"
                        onClick={() => handleRemove(entry.id)}
                      >
                        <Trash2 size={13} />
                        <span>Remove</span>
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UserCabinet;
