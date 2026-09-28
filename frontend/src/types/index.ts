/* ================================================================
   TYPES — Shared TypeScript interfaces for the MedVerify platform
   ================================================================ */

/* ---- Verification ---- */

export type VerificationStatus = 'VERIFIED' | 'REVIEW' | 'SUSPICIOUS' | 'NOT_FOUND' | 'EXPIRED' | 'REQUIRES_REVIEW' | 'INVALID';

export type VerificationMethod = 'QR' | 'DATAMATRIX' | 'BARCODE' | 'PACKAGING_OCR' | 'MANUAL' | 'NFC';

export interface VerificationCheck {
  name: string;
  field: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  weight: number;
  expected?: string;
  actual?: string;
  detail?: string;
}

export interface VerificationResult {
  verification_id: string;
  input_type: string;
  verification_method: VerificationMethod;
  raw_identifier: string;
  parsed_data: Record<string, string>;
  matched_medicine_id: string | null;
  status: VerificationStatus;
  confidence_score: number;
  checks: VerificationCheck[];
  issues: string[];
  medicine: MedicineSummary | null;
  created_at: string;
}

export interface VerificationListItem {
  verification_id: string;
  raw_identifier: string;
  status: VerificationStatus;
  confidence_score: number;
  product_name?: string;
  manufacturer?: string;
  batch_number?: string;
  verification_method?: VerificationMethod;
  created_at: string;
}

export interface VerificationHistoryResponse {
  items: VerificationListItem[];
  total: number;
  page: number;
  limit: number;
}

/* ---- Medicine ---- */

export interface ManufacturerInfo {
  id: string;
  name: string;
}

export interface MedicineSummary {
  product_identifier?: string;
  product_name: string;
  manufacturer: string;
  batch_number: string;
  serial_number: string;
  expiry_date: string;
  manufacturing_date: string;
  dosage?: string;
  package_size?: string;
  status?: string;
}

export interface Medicine {
  id: string;
  product_identifier: string;
  product_name: string;
  manufacturer: ManufacturerInfo;
  batch_number: string;
  serial_number: string;
  manufacturing_date: string;
  expiry_date: string;
  dosage?: string;
  package_size?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/* ---- Auth ---- */

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

/* ---- Analytics ---- */

export interface AnalyticsData {
  total_medicines: number;
  active_medicines: number;
  total_verifications: number;
  anomaly_rate?: number;
  status_breakdown: Record<VerificationStatus, number>;
  method_breakdown?: Record<string, number>;
  recent_verifications: VerificationListItem[];
}

/* ---- Verify Request ---- */

export interface VerifyRequest {
  identifier: string;
  batch_number?: string;
  serial_number?: string;
  manufacturer?: string;
  product_name?: string;
  expiry_date?: string;
  method?: VerificationMethod;
}

/* ---- User Specific ---- */

export interface UserStats {
  user_id: string;
  user_name: string;
  total_verifications: number;
  verified_count: number;
  review_count: number;
  suspicious_count: number;
  not_found_count: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  status: string;
  created_at: string;
  total_verifications: number;
  last_activity: string | null;
}

/* ---- Medicine Cabinet ---- */

export interface CabinetEntry {
  id: string;
  user_id: string;
  medicine_id?: string;
  verification_id?: string;
  nickname?: string;
  notes?: string;
  expiry_date?: string;
  product_name?: string;
  manufacturer?: string;
  batch_number?: string;
  reminder_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/* ---- Notification Preferences ---- */

export interface NotificationPreferences {
  user_id: string;
  email_alerts: boolean;
  push_alerts: boolean;
  recall_alerts: boolean;
  verification_summaries: boolean;
  expiry_reminder_days: number;
}

/* ---- Reports ---- */

export interface VerificationReport {
  id: string;
  user_id: string;
  verification_id?: string;
  report_type: string;
  description: string;
  status: string;
  created_at: string;
}

/* ---- Admin Specific ---- */

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  created_at: string;
  verification_count: number;
  last_activity: string | null;
}

export interface SystemHealthComponent {
  name: string;
  status: 'operational' | 'healthy' | 'degraded' | 'failed' | string;
  latency_ms?: number;
  connection?: string;
  scoring_model?: string;
  processed_count?: number;
  total_records?: number;
  active_records?: number;
  total_accounts?: number;
  active_accounts?: number;
  version?: string;
  environment?: string;
}

export interface SystemHealthData {
  overall_status: 'healthy' | 'degraded';
  timestamp: string;
  components: {
    database: SystemHealthComponent;
    verification_engine: SystemHealthComponent;
    registry: SystemHealthComponent;
    authentication: SystemHealthComponent;
    api: SystemHealthComponent;
  };
  telemetry: {
    total_verifications: number;
    anomaly_rate_percent: number;
    active_medicines: number;
    system_users: number;
  };
}

/* ---- Admin Investigation ---- */

export interface PipelineStage {
  stage: string;
  label: string;
  status: string;
  detail: string;
}

export interface VerificationInvestigation extends VerificationResult {
  pipeline_events: Record<string, any>[];
  pipeline_stages: PipelineStage[];
}

/* ---- Admin Reports ---- */

export type ReportType =
  | 'VERIFICATION_CONCERN'
  | 'PACKAGING_DEFECT'
  | 'EXPIRED_PRODUCT'
  | 'SUSPICIOUS_SELLER'
  | 'BATCH_NOT_RECOGNIZED'
  | 'MANUFACTURER_MISMATCH'
  | 'PRODUCT_MISMATCH'
  | 'EXPIRY_MISMATCH'
  | 'SERIAL_MISMATCH'
  | 'SUSPICIOUS_PACKAGING'
  | 'INCORRECT_BARCODE'
  | 'TAMPERED_SEAL'
  | 'ADVERSE_REACTION'
  | 'OTHER';

/* ---- MedVerify AI Intelligence Layer ---- */

export type ExplanationStyle = 'simple' | 'technical';

export interface VerificationExplanation {
  summary: string;
  what_was_checked: string[];
  matched_evidence: string[];
  concerns: string[];
  next_steps: string[];
  disclaimer: string;
  style: string;
  language: string;
  model_used: string;
  verification_id: string;
  status: string;
  confidence_score: number;
}

export interface AskMedVerifyResponse {
  answer: string;
  grounded_facts: string[];
  verification_referenced?: string | null;
  safety_notice: string;
  conversation_id: string;
  model_used: string;
}

export interface OCRNormalizedCandidate {
  medicine_name?: string | null;
  manufacturer?: string | null;
  gtin?: string | null;
  batch_number?: string | null;
  serial_number?: string | null;
  expiry_date?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  confidence_notes: string[];
}

export interface AdminAIAnalyzeResponse {
  summary: string;
  key_findings: string[];
  risk_assessment: string;
  actionable_recommendations: string[];
  metrics_analyzed: Record<string, any>;
  model_used: string;
}

export interface AIHealthResponse {
  available: boolean;
  provider: string;
  model: string;
  reason?: string | null;
}

