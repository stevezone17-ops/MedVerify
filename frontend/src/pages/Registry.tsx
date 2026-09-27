import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  Search,
  Building2,
  Calendar,
  Hash,
  ScanLine,
  Filter,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { getMedicines } from '../api/client';
import type { Medicine } from '../types';
import { pageVariants, staggerContainer, staggerItem } from '../animations/motion';
import { Link, useNavigate } from '../router';

export default function Registry() {
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('all');

  useEffect(() => {
    getMedicines()
      .then(setMedicines)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const manufacturers = Array.from(
    new Set(medicines.map((m) => m.manufacturer?.name).filter(Boolean)),
  );

  const filtered = medicines.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      m.product_name.toLowerCase().includes(q) ||
      m.product_identifier.includes(q) ||
      (m.manufacturer?.name && m.manufacturer.name.toLowerCase().includes(q)) ||
      m.batch_number.toLowerCase().includes(q);

    const matchesMfr =
      selectedManufacturer === 'all' || m.manufacturer?.name === selectedManufacturer;

    return matchesSearch && matchesMfr;
  });

  const handleTestVerify = (m: Medicine) => {
    navigate('/app/scanner');
  };

  if (loading) {
    return (
      <div className="empty-state" style={{ minHeight: '50vh' }}>
        <div className="modal-step-item__spinner" style={{ width: 32, height: 32 }} />
        <h3 className="empty-state__title" style={{ marginTop: 'var(--space-4)' }}>
          Loading Authorized Medicine Registry...
        </h3>
      </div>
    );
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
    >
      {/* Header */}
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
            Authorized Medicine Catalog
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-500)', marginTop: 2 }}>
            Cryptographically registered pharmaceutical formulations, batch limits, and manufacturer
            specifications.
          </p>
        </div>

        <Link to="/app/scanner" className="btn btn-primary btn-sm">
          <ScanLine size={14} />
          <span>Verify Medicine</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="header-search-bar" style={{ width: '320px' }}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Filter by name, GTIN, or batch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={selectedManufacturer}
          onChange={(e) => setSelectedManufacturer(e.target.value)}
          className="btn btn-secondary btn-sm"
          style={{ padding: '0 12px', height: '36px' }}
        >
          <option value="all">All Manufacturers ({manufacturers.length})</option>
          {manufacturers.map((mfr) => (
            <option key={mfr} value={mfr}>
              {mfr}
            </option>
          ))}
        </select>

        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-slate-500)',
          }}
        >
          Showing {filtered.length} of {medicines.length} products
        </span>
      </div>

      {/* Catalog Cards Grid */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {filtered.map((med) => {
          const isExpired = new Date(med.expiry_date) < new Date();

          return (
            <motion.div
              key={med.id}
              variants={staggerItem}
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                boxShadow: 'var(--shadow-xs)',
                transition: 'all 0.15s ease',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-brand-800)',
                      backgroundColor: 'var(--color-brand-50)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    GTIN: {med.product_identifier}
                  </span>
                  <span
                    className={`status-badge status-badge--sm ${
                      med.status === 'active' ? 'status-badge--verified' : 'status-badge--notfound'
                    }`}
                  >
                    <span className="status-badge__dot" />
                    <span>{med.status}</span>
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 700,
                    color: 'var(--color-slate-900)',
                    lineHeight: 1.3,
                  }}
                >
                  {med.product_name}
                </h3>

                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-slate-500)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '4px',
                  }}
                >
                  <Building2 size={13} />
                  <span>{med.manufacturer?.name}</span>
                </div>
              </div>

              {/* Specimen Details Chips */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-slate-50)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <div>
                  <span style={{ color: 'var(--color-slate-400)', display: 'block', fontSize: '10px' }}>
                    BATCH CODE
                  </span>
                  <span className="font-mono" style={{ fontWeight: 600 }}>
                    {med.batch_number}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--color-slate-400)', display: 'block', fontSize: '10px' }}>
                    EXPIRATION
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontWeight: 600,
                      color: isExpired ? 'var(--color-suspicious-text)' : 'inherit',
                    }}
                  >
                    {med.expiry_date}
                  </span>
                </div>
                {med.dosage && (
                  <div>
                    <span style={{ color: 'var(--color-slate-400)', display: 'block', fontSize: '10px' }}>
                      DOSAGE
                    </span>
                    <span style={{ fontWeight: 600 }}>{med.dosage}</span>
                  </div>
                )}
                {med.package_size && (
                  <div>
                    <span style={{ color: 'var(--color-slate-400)', display: 'block', fontSize: '10px' }}>
                      PACKAGE
                    </span>
                    <span style={{ fontWeight: 600 }}>{med.package_size}</span>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div style={{ paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-subtle)' }}>
                <Link
                  to="/app/scanner"
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <ScanLine size={13} />
                  <span>Test in Scanner</span>
                </Link>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
