import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  Sparkles,
  ShieldCheck,
  Play,
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';

export interface DemoScenarioItem {
  id: string;
  badge: 'VERIFIED' | 'REVIEW' | 'SUSPICIOUS' | 'NOT_FOUND';
  title: string;
  identifier: string;
  batch?: string;
  serial?: string;
  expiry?: string;
  objective: string;
  expectedVerdict: string;
}

export const DEMO_PRESET_ITEMS: DemoScenarioItem[] = [
  {
    id: 'demo-verified',
    badge: 'VERIFIED',
    title: 'Genuine Specimen — Amoxicillin 500mg',
    identifier: '89012345678901',
    batch: 'BATCH-2026-001',
    expiry: '2028-01-09',
    objective: 'Test complete authentic match against PharmaCore Laboratories registration.',
    expectedVerdict: 'VERIFIED — Product identifier, batch integrity, and validity check pass.',
  },
  {
    id: 'demo-review',
    badge: 'REVIEW',
    title: 'Expired Product — Ibuprofen 400mg',
    identifier: '89012345678908',
    batch: 'BATCH-2025-012',
    objective: 'Test automated detection of product whose regulatory expiry date has elapsed.',
    expectedVerdict: 'REVIEW REQUIRED — Outdated medicine distribution alert.',
  },
  {
    id: 'demo-suspicious',
    badge: 'SUSPICIOUS',
    title: 'Counterfeit Batch — Metformin 850mg',
    identifier: '89012345678902',
    batch: 'FAKE-BATCH-999',
    serial: 'SER-MS-000012',
    objective: 'Test critical batch code mismatch detection against MediSafe Healthcare record.',
    expectedVerdict: 'SUSPICIOUS Flag — Tampered batch anomaly alert.',
  },
  {
    id: 'demo-unregistered',
    badge: 'NOT_FOUND',
    title: 'Unregistered Barcode / Unknown Product',
    identifier: '99999999999999',
    objective: 'Test fail-safe behavior when scanned identifier does not exist in registry.',
    expectedVerdict: 'NOT REGISTERED — Advisory guidance to patient/pharmacist.',
  },
  {
    id: 'demo-gs1',
    badge: 'VERIFIED',
    title: 'GS1 Application Identifier Format',
    identifier: '(01)89012345678903(10)BATCH-2026-108(21)SER-PC-000089(17)2028-05-31',
    objective: 'Test decoding GS1 GTIN(01), Batch(10), Serial(21), and Expiry(17).',
    expectedVerdict: 'VERIFIED — Normalized GS1 parsing succeeds.',
  },
];

interface DemoScenariosProps {
  onSelectAndExecute: (scenario: DemoScenarioItem) => void;
  isVerifying: boolean;
}

export const DemoScenarios: React.FC<DemoScenariosProps> = ({
  onSelectAndExecute,
  isVerifying,
}) => {
  return (
    <div className="demo-scenarios-container">
      <div className="demo-data-callout">
        <Sparkles size={14} className="demo-data-icon" />
        <div>
          <strong>PRE-CONFIGURED BENCHMARK SCENARIOS</strong>
          <p>
            Clicking a scenario initiates a <strong>real live query to the backend API</strong> and evaluates the
            active MongoDB pharmaceutical registry.
          </p>
        </div>
      </div>

      <div className="demo-scenarios-grid">
        {DEMO_PRESET_ITEMS.map((item) => (
          <div key={item.id} className="demo-scenario-card">
            <div className="demo-scenario-header">
              <span className="demo-scenario-title">{item.title}</span>
              <StatusBadge status={item.badge} size="sm" />
            </div>

            <p className="demo-scenario-objective">{item.objective}</p>

            <div className="demo-scenario-meta">
              <span className="demo-scenario-code font-mono">ID: {item.identifier}</span>
              {item.batch && (
                <span className="demo-scenario-batch font-mono">Batch: {item.batch}</span>
              )}
            </div>

            <div className="demo-scenario-footer">
              <span className="demo-scenario-expected">Expected: {item.expectedVerdict}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm demo-run-btn"
                onClick={() => onSelectAndExecute(item)}
                disabled={isVerifying}
              >
                <Play size={12} />
                <span>Test Scenario</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DemoScenarios;
