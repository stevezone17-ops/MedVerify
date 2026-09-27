import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Package,
  Calendar,
  Layers,
  X,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  getAdminMedicines,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  reactivateMedicine,
} from '../../api/client';
import type { Medicine } from '../../types';

export const AdminRegistry: React.FC = () => {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [manufacturerFilter, setManufacturerFilter] = useState<string>('ALL');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);

  // Form states
  const [formIdentifier, setFormIdentifier] = useState('');
  const [formName, setFormName] = useState('');
  const [formMfrId, setFormMfrId] = useState('mfr_001');
  const [formMfrName, setFormMfrName] = useState('PharmaCore Laboratories');
  const [formBatch, setFormBatch] = useState('');
  const [formSerial, setFormSerial] = useState('');
  const [formMfgDate, setFormMfgDate] = useState('2026-01-10');
  const [formExpDate, setFormExpDate] = useState('2028-01-09');
  const [formDosage, setFormDosage] = useState('500 mg');
  const [formPkgSize, setFormPkgSize] = useState('10 capsules');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const fetchMedicines = async () => {
    setLoading(true);
    try {
      const data = await getAdminMedicines();
      setMedicines(data);
    } catch (e) {
      console.error('Failed to load medicines:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedicines();
  }, []);

  const openCreateModal = () => {
    setEditingMedicine(null);
    setFormIdentifier('');
    setFormName('');
    setFormMfrId('mfr_001');
    setFormMfrName('PharmaCore Laboratories');
    setFormBatch('');
    setFormSerial('');
    setFormMfgDate('2026-01-10');
    setFormExpDate('2028-01-09');
    setFormDosage('500 mg');
    setFormPkgSize('10 capsules');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (m: Medicine) => {
    setEditingMedicine(m);
    setFormIdentifier(m.product_identifier);
    setFormName(m.product_name);
    setFormMfrId(m.manufacturer?.id || 'mfr_001');
    setFormMfrName(m.manufacturer?.name || 'PharmaCore Laboratories');
    setFormBatch(m.batch_number);
    setFormSerial(m.serial_number || '');
    setFormMfgDate(m.manufacturing_date || '');
    setFormExpDate(m.expiry_date || '');
    setFormDosage(m.dosage || '');
    setFormPkgSize(m.package_size || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDeactivate = async (id: string, name: string) => {
    if (!window.confirm(`Deactivate medicine "${name}"? It will no longer pass verification.`)) return;
    try {
      await deleteMedicine(id);
      await fetchMedicines();
    } catch (e: any) {
      alert(`Deactivation failed: ${e.message}`);
    }
  };

  const handleReactivate = async (id: string, name: string) => {
    if (!window.confirm(`Reactivate medicine "${name}"?`)) return;
    try {
      await reactivateMedicine(id);
      await fetchMedicines();
    } catch (e: any) {
      alert(`Reactivation failed: ${e.message}`);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formIdentifier.trim() || !formName.trim() || !formBatch.trim() || !formExpDate.trim()) {
      setFormError('Please fill in product identifier, name, batch number, and expiry date.');
      return;
    }

    setFormSubmitting(true);
    try {
      const payload = {
        product_identifier: formIdentifier.trim(),
        product_name: formName.trim(),
        manufacturer_id: formMfrId,
        manufacturer_name: formMfrName,
        batch_number: formBatch.trim(),
        serial_number: formSerial.trim() || undefined,
        manufacturing_date: formMfgDate,
        expiry_date: formExpDate,
        dosage: formDosage,
        package_size: formPkgSize,
      };

      if (editingMedicine) {
        await updateMedicine(editingMedicine.id, payload);
      } else {
        await createMedicine(payload);
      }

      setIsModalOpen(false);
      await fetchMedicines();
    } catch (e: any) {
      setFormError(e.message || 'Operation failed.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Extract unique manufacturers for filter dropdown
  const uniqueManufacturers = useMemo(() => {
    const set = new Set<string>();
    medicines.forEach((m) => {
      if (m.manufacturer?.name) set.add(m.manufacturer.name);
    });
    return Array.from(set);
  }, [medicines]);

  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      const q = search.toLowerCase();
      const matchesSearch =
        m.product_name.toLowerCase().includes(q) ||
        m.product_identifier.toLowerCase().includes(q) ||
        m.batch_number.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter;
      const matchesMfr = manufacturerFilter === 'ALL' || m.manufacturer?.name === manufacturerFilter;

      return matchesSearch && matchesStatus && matchesMfr;
    });
  }, [medicines, search, statusFilter, manufacturerFilter]);

  return (
    <div className="admin-registry-container">
      {/* Header */}
      <div className="admin-registry-header">
        <div>
          <span className="admin-registry-eyebrow">MEDVERIFY / MASTER PRODUCT CATALOG</span>
          <h1 className="admin-registry-title">Product Registry Management</h1>
          <p className="admin-registry-subtitle">
            Authorize official pharmaceutical GTINs, active batch runs, approved manufacturers, and packaging parameters.
          </p>
        </div>

        <div className="admin-registry-header-actions">
          <button onClick={fetchMedicines} className="admin-reg-refresh-btn" title="Refresh registry records">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button onClick={openCreateModal} className="admin-reg-create-btn">
            <Plus size={16} />
            <span>Register New Medicine</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="admin-registry-toolbar">
        <div className="admin-reg-search-wrap">
          <Search size={16} className="admin-reg-search-icon" />
          <input
            type="text"
            placeholder="Search by brand name, GTIN, or batch number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="admin-reg-search-input"
          />
        </div>

        <div className="admin-reg-filters">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="admin-reg-select"
          >
            <option value="ALL">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <select
            value={manufacturerFilter}
            onChange={(e) => setManufacturerFilter(e.target.value)}
            className="admin-reg-select"
          >
            <option value="ALL">All Manufacturers</option>
            {uniqueManufacturers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Registry Table */}
      <div className="admin-reg-table-card">
        {loading ? (
          <div className="admin-reg-loading">Loading authorized medicine catalog...</div>
        ) : filteredMedicines.length === 0 ? (
          <div className="admin-reg-empty">No medicine catalog records found.</div>
        ) : (
          <div className="admin-reg-table-wrap">
            <table className="admin-reg-table">
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>PRODUCT IDENTITY & GTIN</th>
                  <th>MANUFACTURER</th>
                  <th>BATCH NUMBER</th>
                  <th>EXPIRATION DATE</th>
                  <th>DOSAGE / PACKAGING</th>
                  <th style={{ textAlign: 'right' }}>OPERATIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredMedicines.map((m) => {
                  const isInactive = m.status === 'inactive';
                  return (
                    <tr key={m.id} className={isInactive ? 'inactive-row' : ''}>
                      <td>
                        <span className={`admin-reg-status-tag ${m.status}`}>
                          <span className="reg-status-dot" />
                          {m.status.toUpperCase()}
                        </span>
                      </td>

                      <td>
                        <div className="admin-reg-med-cell">
                          <span className="admin-reg-med-name">{m.product_name}</span>
                          <span className="admin-reg-gtin">GTIN: {m.product_identifier}</span>
                        </div>
                      </td>

                      <td>
                        <span className="admin-reg-mfr">{m.manufacturer?.name || 'Unspecified'}</span>
                      </td>

                      <td>
                        <code className="admin-reg-batch">{m.batch_number}</code>
                      </td>

                      <td>
                        <span className="admin-reg-exp">{m.expiry_date}</span>
                      </td>

                      <td>
                        <span className="admin-reg-dosage">
                          {m.dosage} · {m.package_size}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div className="admin-reg-actions">
                          <button
                            onClick={() => openEditModal(m)}
                            className="admin-reg-action-btn edit"
                            title="Edit Medicine Record"
                          >
                            <Edit2 size={14} />
                            <span>Edit</span>
                          </button>

                          {isInactive ? (
                            <button
                              onClick={() => handleReactivate(m.id, m.product_name)}
                              className="admin-reg-action-btn reactivate"
                              title="Reactivate Medicine Record"
                            >
                              <RotateCcw size={14} />
                              <span>Reactivate</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeactivate(m.id, m.product_name)}
                              className="admin-reg-action-btn delete"
                              title="Deactivate Medicine Record"
                            >
                              <Trash2 size={14} />
                              <span>Deactivate</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Medicine Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="admin-modal-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="admin-modal-card wide"
            >
              <div className="admin-modal-header">
                <div>
                  <h3 className="admin-modal-title">
                    {editingMedicine ? 'Edit Registry Medicine' : 'Register New Medicine'}
                  </h3>
                  <p className="admin-modal-sub">
                    Authorized records are immediately verified against incoming packaging scans.
                  </p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="admin-modal-close">
                  <X size={18} />
                </button>
              </div>

              {formError && (
                <div className="admin-modal-error">
                  <AlertTriangle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="admin-modal-form">
                <div className="admin-form-row-2">
                  <div className="admin-form-group">
                    <label>GTIN / Product Identifier (Unique)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 89012345678901"
                      disabled={!!editingMedicine}
                      value={formIdentifier}
                      onChange={(e) => setFormIdentifier(e.target.value)}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label>Full Product & Brand Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Amoxicillin 500 mg Capsules"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="admin-form-row-2">
                  <div className="admin-form-group">
                    <label>Authorized Manufacturer Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. PharmaCore Laboratories"
                      value={formMfrName}
                      onChange={(e) => setFormMfrName(e.target.value)}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label>Batch / Lot Number</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. BATCH-2026-001"
                      value={formBatch}
                      onChange={(e) => setFormBatch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="admin-form-row-2">
                  <div className="admin-form-group">
                    <label>Expiration Date (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      required
                      value={formExpDate}
                      onChange={(e) => setFormExpDate(e.target.value)}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label>Manufacturing Date (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      value={formMfgDate}
                      onChange={(e) => setFormMfgDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="admin-form-row-2">
                  <div className="admin-form-group">
                    <label>Dosage</label>
                    <input
                      type="text"
                      placeholder="e.g. 500 mg"
                      value={formDosage}
                      onChange={(e) => setFormDosage(e.target.value)}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label>Package Size</label>
                    <input
                      type="text"
                      placeholder="e.g. 10 capsules"
                      value={formPkgSize}
                      onChange={(e) => setFormPkgSize(e.target.value)}
                    />
                  </div>
                </div>

                <div className="admin-modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="admin-modal-btn cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="admin-modal-btn submit"
                  >
                    {formSubmitting
                      ? 'Saving Record...'
                      : editingMedicine
                      ? 'Update Medicine'
                      : 'Create Registry Record'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminRegistry;
