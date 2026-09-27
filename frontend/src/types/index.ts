/* ================================================================
   TYPES — Shared TypeScript interfaces for the MedVerify platform
   ================================================================ */

/* ---- Verification ---- */

export type VerificationStatus = 'VERIFIED' | 'REVIEW' | 'SUSPICIOUS' | 'NOT_FOUND';

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
  status_breakdown: Record<VerificationStatus, number>;
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

