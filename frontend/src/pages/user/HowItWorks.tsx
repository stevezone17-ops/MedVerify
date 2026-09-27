import React from 'react';
import {
  ShieldCheck,
  QrCode,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  FileCheck,
  ArrowRight,
  Shield,
  Layers,
} from 'lucide-react';
import { Link } from '../../router';

export const HowItWorks: React.FC = () => {
  return (
    <div className="how-it-works-container">
      {/* Header */}
      <div className="how-it-works-header">
        <span className="how-it-works-eyebrow">MEDVERIFY / PATIENT & PHARMACY EDUCATION</span>
        <h1 className="how-it-works-title">How Medicine Verification Works</h1>
        <p className="how-it-works-subtitle">
          Learn how MedVerify safeguards the pharmaceutical supply chain by evaluating 2D barcodes,
          batch integrity, and official manufacturer authorizations.
        </p>
      </div>

      {/* 4 Step Process Visual */}
      <section className="how-it-works-steps">
        <div className="how-step-card">
          <div className="how-step-badge">STEP 1</div>
          <div className="how-step-icon-wrap">
            <QrCode size={28} />
          </div>
          <h3 className="how-step-title">Packaging Optical Capture</h3>
          <p className="how-step-desc">
            Medicine cartons and blister foils carry standardized 2D DataMatrix or GS1 barcodes containing
            the global trade item number (GTIN), batch code, expiration date, and unique item serial.
          </p>
        </div>

        <div className="how-step-card">
          <div className="how-step-badge">STEP 2</div>
          <div className="how-step-icon-wrap">
            <ScanLine size={28} />
          </div>
          <h3 className="how-step-title">GS1 Normalization</h3>
          <p className="how-step-desc">
            The scanner decomposes the raw payload using Application Identifiers: (01) GTIN, (10) Batch,
            (17) Expiration, and (21) Serial Number, parsing even complex GS1 Digital Links.
          </p>
        </div>

        <div className="how-step-card">
          <div className="how-step-badge">STEP 3</div>
          <div className="how-step-icon-wrap">
            <FileCheck size={28} />
          </div>
          <h3 className="how-step-title">Registry Cross-Check</h3>
          <p className="how-step-desc">
            The backend engine performs a multi-point cryptographic comparison against the registered
            pharmaceutical database, verifying manufacturer license and active manufacturing runs.
          </p>
        </div>

        <div className="how-step-card">
          <div className="how-step-badge">STEP 4</div>
          <div className="how-step-icon-wrap">
            <ShieldCheck size={28} />
          </div>
          <h3 className="how-step-title">Explainable Decision</h3>
          <p className="how-step-desc">
            You receive an instantaneous, explainable verdict showing which parameters matched and whether
            the medication is safe for consumption.
          </p>
        </div>
      </section>

      {/* Verification Status Meaning Guide */}
      <section className="how-it-works-verdicts">
        <h2 className="how-verdicts-heading">Understanding Your Verification Verdict</h2>
        <div className="how-verdicts-grid">
          <div className="how-verdict-card verified">
            <div className="how-verdict-header">
              <CheckCircle2 size={24} className="how-verdict-icon verified" />
              <h3>VERIFIED</h3>
            </div>
            <p>
              The scanned GTIN, manufacturer license, batch number, and validity dates match official
              registry records. The product is authentic and approved for distribution.
            </p>
          </div>

          <div className="how-verdict-card review">
            <div className="how-verdict-header">
              <AlertTriangle size={24} className="how-verdict-icon review" />
              <h3>REVIEW REQUIRED</h3>
            </div>
            <p>
              The product exists in the registry, but has passed its expiration date, or critical packaging
              identifiers were omitted. Consult your pharmacist before dispensing.
            </p>
          </div>

          <div className="how-verdict-card suspicious">
            <div className="how-verdict-header">
              <XOctagon size={24} className="how-verdict-icon suspicious" />
              <h3>SUSPICIOUS</h3>
            </div>
            <p>
              One or more parameters critically mismatched: wrong batch number, unauthorized manufacturer,
              or cloned serial number reuse. Do not consume or dispense this package.
            </p>
          </div>

          <div className="how-verdict-card not-found">
            <div className="how-verdict-header">
              <HelpCircle size={24} className="how-verdict-icon not-found" />
              <h3>NOT REGISTERED</h3>
            </div>
            <p>
              The product code does not appear in the MedVerify registry. This does not automatically mean
              counterfeit, but the medicine cannot be authoritatively authenticated.
            </p>
          </div>
        </div>
      </section>

      {/* Action Banner */}
      <section className="how-it-works-cta-box">
        <div>
          <h3>Ready to verify your medicine?</h3>
          <p>Open the Precision Scanner or enter the packaging identifier manually.</p>
        </div>
        <Link to="/app/scanner" className="how-it-works-cta-btn">
          Open Scanner Now
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
};

export default HowItWorks;
