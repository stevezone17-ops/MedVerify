import React from 'react';
import { Link } from '../router';
import { motion } from 'framer-motion';
import {
  Shield,
  ScanLine,
  Search,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  Database,
  ArrowRight,
  Layers,
  Scale,
  Award,
} from 'lucide-react';
import { pageVariants } from '../animations/motion';
import { StatusBadge } from '../components/ui/StatusBadge';

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Capture or Enter Payload',
    desc: 'Capture 2D DataMatrix, QR code, GS1 Digital Link, or manually input the GTIN and packaging lot details.',
    icon: ScanLine,
  },
  {
    step: '02',
    title: 'Multi-Format Normalization',
    desc: 'The ingestion parser decodes plain identifiers, JSON objects, pipe-delimited strings, or GS1 Application Identifiers ((01)GTIN, (10)Batch, (21)Serial).',
    icon: Search,
  },
  {
    step: '03',
    title: 'Registry Cross-Referencing',
    desc: 'The normalized identifier is queried in real time against the authorized pharmaceutical registry database in MongoDB.',
    icon: Database,
  },
  {
    step: '04',
    title: '6-Factor Forensic Evaluation',
    desc: 'Each attribute (GTIN, manufacturer, batch number, expiry date, metadata, serial uniqueness) is tested and weighted.',
    icon: Layers,
  },
  {
    step: '05',
    title: 'Confidence Verdict & Audit Log',
    desc: 'A transparent 0-100% confidence score is calculated and permanently recorded to the immutable inspection ledger.',
    icon: Award,
  },
];

const WEIGHTED_CHECKS = [
  { check: 'Product Identifier (GTIN)', weight: 30, critical: true, desc: 'Exact match against authorized pharmaceutical formulation.' },
  { check: 'Manufacturer Organization', weight: 20, critical: true, desc: 'Validates marketing authorization holder and facility entity.' },
  { check: 'Batch / Lot Code', weight: 20, critical: true, desc: 'Cross-checks manufacturing lot against recall notices and batch limits.' },
  { check: 'Expiry Date Validity', weight: 10, critical: false, desc: 'Verifies expiration date syntax and flags elapsed shelf life.' },
  { check: 'Product Metadata & Formulation', weight: 10, critical: false, desc: 'Verifies strength, dosage form, and packaging unit consistency.' },
  { check: 'Serial Uniqueness (Anti-Cloning)', weight: 10, critical: true, desc: 'Detects duplicated serial numbers previously logged in the ledger.' },
];

export default function About() {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}
    >
      {/* Header */}
      <div>
        <h1
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            color: 'var(--color-slate-900)',
            letterSpacing: '-0.02em',
          }}
        >
          Verification Engine Architecture
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-500)', marginTop: 2 }}>
          Technical specification of the MedVerify explainable confidence scoring model and regulatory screening workflow.
        </p>
      </div>

      {/* 1. Workflow Stepper */}
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <span className="system-health-widget__eyebrow">SCREENING PIPELINE</span>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-slate-900)', marginBottom: 'var(--space-5)' }}>
          5-Stage Ingestion & Verification Sequence
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {WORKFLOW_STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                style={{
                  display: 'flex',
                  gap: 'var(--space-4)',
                  alignItems: 'flex-start',
                  padding: 'var(--space-3) var(--space-4)',
                  backgroundColor: 'var(--color-slate-50)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-brand-100)',
                    color: 'var(--color-brand-800)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '12px',
                    flexShrink: 0,
                  }}
                >
                  {s.step}
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-slate-900)' }}>
                    {s.title}
                  </h3>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)', marginTop: '2px', lineHeight: 1.5 }}>
                    {s.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Scoring Model Table */}
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
          <div>
            <span className="system-health-widget__eyebrow">ALGORITHMIC MODEL</span>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-slate-900)' }}>
              6-Factor Weighted Scoring Distribution
            </h2>
          </div>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: 'var(--color-brand-50)',
              color: 'var(--color-brand-800)',
              padding: '2px 8px',
              borderRadius: '4px',
            }}
          >
            Total: 100 Points
          </span>
        </div>

        <div className="med-table-wrapper">
          <table className="med-table">
            <thead>
              <tr>
                <th>Verification Dimension</th>
                <th>Weight</th>
                <th>Impact</th>
                <th>Validation Scope</th>
              </tr>
            </thead>
            <tbody>
              {WEIGHTED_CHECKS.map((c) => (
                <tr key={c.check}>
                  <td style={{ fontWeight: 600, color: 'var(--color-slate-900)' }}>{c.check}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="font-mono" style={{ fontWeight: 700, width: '28px' }}>
                        {c.weight}%
                      </span>
                      <div
                        style={{
                          width: 80,
                          height: 6,
                          backgroundColor: 'var(--color-slate-100)',
                          borderRadius: '999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${c.weight * 2.5}%`,
                            height: '100%',
                            backgroundColor: 'var(--color-brand-600)',
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: c.critical ? '#991b1b' : 'var(--color-slate-600)',
                        backgroundColor: c.critical ? '#fef2f2' : 'var(--color-slate-100)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {c.critical ? 'Critical Fail' : 'Warning'}
                    </span>
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                    {c.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Decision Matrix */}
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <span className="system-health-widget__eyebrow">CLASSIFICATION RUBRIC</span>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-slate-900)', marginBottom: 'var(--space-5)' }}>
          Confidence Score & Threshold Decision Rules
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          {[
            {
              status: 'VERIFIED',
              score: '≥ 80%',
              desc: 'No critical failures. All required attributes match active authorization records.',
            },
            {
              status: 'REVIEW',
              score: '50% – 79%',
              desc: 'Missing barcode attributes, insufficient fields, or product has exceeded expiry date.',
            },
            {
              status: 'SUSPICIOUS',
              score: '< 50% or Critical Mismatch',
              desc: 'Batch mismatch, conflicting manufacturer, or cloned serial number previously encountered.',
            },
            {
              status: 'NOT_FOUND',
              score: '0%',
              desc: 'Product identifier does not exist in any registered pharmaceutical catalog.',
            },
          ].map((item) => (
            <div
              key={item.status}
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--color-slate-50)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <StatusBadge status={item.status} size="sm" />
                <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-slate-600)' }}>
                  {item.score}
                </span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)', lineHeight: 1.5 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Box */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-5) var(--space-6)',
          backgroundColor: 'var(--color-brand-50)',
          border: '1px solid var(--color-brand-200)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        <div>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-brand-950)' }}>
            Experience the Verification Engine in Action
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-800)', marginTop: 2 }}>
            Test pre-configured genuine, tampered, and cloned payloads using the interactive scanner.
          </p>
        </div>
        <Link to="/app/scanner" className="btn btn-primary btn-sm">
          <ScanLine size={14} />
          <span>Launch Scanner</span>
        </Link>
      </div>
    </motion.div>
  );
}
