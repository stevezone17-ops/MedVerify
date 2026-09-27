import React, { useState } from 'react';
import {
  ShieldCheck,
  Barcode,
  Hash,
  Calendar,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { parseGS1Payload, ParsedGS1Payload } from '../../utils/gs1Parser';

interface ManualPayloadFormProps {
  onSubmit: (params: {
    identifier: string;
    batch?: string;
    serial?: string;
    expiry?: string;
  }) => void;
  isVerifying: boolean;
}

export const ManualPayloadForm: React.FC<ManualPayloadFormProps> = ({
  onSubmit,
  isVerifying,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [batch, setBatch] = useState('');
  const [serial, setSerial] = useState('');
  const [expiry, setExpiry] = useState('');
  const [parsedInfo, setParsedInfo] = useState<string | null>(null);

  // Auto-parse if user types/pastes a GS1 or structured string
  const handleIdentifierChange = (val: string) => {
    setIdentifier(val);

    if (val.includes('(') || val.includes('|') || val.startsWith('01') || val.startsWith('{')) {
      const parsed = parseGS1Payload(val);
      if (parsed.gtin && parsed.format !== 'PLAIN_IDENTIFIER') {
        if (parsed.batch) setBatch(parsed.batch);
        if (parsed.serial) setSerial(parsed.serial);
        if (parsed.expiry) setExpiry(parsed.expiry);
        setParsedInfo(`Detected ${parsed.format.replace('_', ' ')}: GTIN ${parsed.gtin}`);
        return;
      }
    }
    setParsedInfo(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    // Check if the identifier is a compound GS1 string
    const parsed = parseGS1Payload(identifier.trim());

    onSubmit({
      identifier: parsed.gtin || identifier.trim(),
      batch: batch.trim() || parsed.batch || undefined,
      serial: serial.trim() || parsed.serial || undefined,
      expiry: expiry.trim() || parsed.expiry || undefined,
    });
  };

  return (
    <form className="manual-payload-form" onSubmit={handleSubmit}>
      <div className="manual-form-group">
        <label htmlFor="manual-gtin" className="manual-field-label">
          <Barcode size={13} />
          <span>Product Identifier / GTIN / GS1 Digital String *</span>
        </label>
        <input
          id="manual-gtin"
          type="text"
          placeholder="e.g. 89012345678901 or (01)89012345678903(10)..."
          value={identifier}
          onChange={(e) => handleIdentifierChange(e.target.value)}
          className="manual-input font-mono"
          required
          autoFocus
        />
        {parsedInfo && (
          <div className="manual-parse-callout">
            <Sparkles size={12} className="parse-callout-icon" />
            <span>{parsedInfo} — Batch, Serial, and Expiry populated automatically.</span>
          </div>
        )}
      </div>

      <div className="manual-grid-two-col">
        <div className="manual-form-group">
          <label htmlFor="manual-batch" className="manual-field-label">
            <Hash size={13} />
            <span>Batch / Lot Number (Optional)</span>
          </label>
          <input
            id="manual-batch"
            type="text"
            placeholder="e.g. BATCH-2026-001"
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            className="manual-input font-mono"
          />
        </div>

        <div className="manual-form-group">
          <label htmlFor="manual-serial" className="manual-field-label">
            <Layers size={13} />
            <span>Serial Number (Optional)</span>
          </label>
          <input
            id="manual-serial"
            type="text"
            placeholder="e.g. SER-PC-000001"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            className="manual-input font-mono"
          />
        </div>
      </div>

      <div className="manual-form-group">
        <label htmlFor="manual-expiry" className="manual-field-label">
          <Calendar size={13} />
          <span>Regulatory Expiry Date (YYYY-MM-DD or YYMMDD)</span>
        </label>
        <input
          id="manual-expiry"
          type="text"
          placeholder="e.g. 2028-01-09 or 280109"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="manual-input font-mono"
        />
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg manual-submit-cta"
        disabled={isVerifying || !identifier.trim()}
      >
        <ShieldCheck size={18} />
        <span>{isVerifying ? 'Cross-Checking Registry...' : 'Initiate 6-Factor Verification'}</span>
      </button>
    </form>
  );
};

export default ManualPayloadForm;
