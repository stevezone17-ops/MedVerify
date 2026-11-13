/**
 * API client — centralised HTTP layer for MedVerify.
 *
 * Every request goes through `apiFetch` which handles:
 * - base URL resolution (Vite proxy in dev)
 * - JSON content type
 * - JWT bearer token from localStorage
 * - Error normalisation
 */

import type {
  VerifyRequest,
  VerificationResult,
  VerificationHistoryResponse,
  Medicine,
  AuthResponse,
  User,
  AnalyticsData,
  CabinetEntry,
  NotificationPreferences,
  VerificationReport,
} from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  API_BASE_URL,
  buildEndpointUrl,
  API_ENDPOINTS,
  validateApiConfig,
} from './config';

export { API_BASE_URL, buildEndpointUrl, API_ENDPOINTS, validateApiConfig };

// ---------------------------------------------------------------------------
// Error Classification & Typed API Error
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'DATABASE_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export class MedVerifyApiError extends Error {
  code: ApiErrorCode;
  status?: number;
  url: string;
  data?: any;
  isNetworkError: boolean;

  constructor(
    message: string,
    code: ApiErrorCode,
    options: { status?: number; url: string; data?: any; isNetworkError?: boolean }
  ) {
    super(message);
    this.name = 'MedVerifyApiError';
    this.code = code;
    this.status = options.status;
    this.url = options.url;
    this.data = options.data;
    this.isNetworkError = !!options.isNetworkError;
    Object.setPrototypeOf(this, MedVerifyApiError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Base fetch wrapper with bounded retry for idempotent operations
// ---------------------------------------------------------------------------

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;
const AI_TIMEOUT_MS = 45000;
const MAX_IDEMPOTENT_RETRIES = 2;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const token = localStorage.getItem('medverify_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = buildEndpointUrl(path);
  const method = (options.method || 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';
  const maxRetries = isIdempotent ? (options.retries ?? MAX_IDEMPOTENT_RETRIES) : 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });
      clearTimeout(timeoutTimer);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const rawDetail = body.detail || body.error?.message || `HTTP ${res.status}`;
        const errorDetail = typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);

        let code: ApiErrorCode = 'UNKNOWN';
        if (res.status === 401) code = 'UNAUTHORIZED';
        else if (res.status === 403) code = 'FORBIDDEN';
        else if (res.status === 404) code = 'NOT_FOUND';
        else if (res.status === 503) code = 'DATABASE_UNAVAILABLE';
        else if (res.status >= 500) code = 'SERVER_ERROR';

        // Retry idempotent requests on transient 502/503/504 if attempts remain
        if (isIdempotent && attempt < maxRetries && (res.status === 502 || res.status === 503 || res.status === 504)) {
          attempt++;
          const backoff = attempt * 400;
          console.warn(`[MedVerify API Client] Retrying ${method} ${url} in ${backoff}ms (attempt ${attempt}/${maxRetries})...`);
          await sleep(backoff);
          continue;
        }

        console.error('[MedVerify API Client] HTTP Error:', {
          url,
          status: res.status,
          statusText: res.statusText,
          code,
          detail: errorDetail,
        });

        throw new MedVerifyApiError(errorDetail, code, {
          status: res.status,
          url,
          data: body,
          isNetworkError: false,
        });
      }

      return (await res.json()) as T;
    } catch (err: any) {
      clearTimeout(timeoutTimer);

      // If already a MedVerifyApiError thrown above, rethrow
      if (err instanceof MedVerifyApiError) {
        throw err;
      }

      const isAbort = err.name === 'AbortError';
      const isNet =
        isAbort ||
        err.name === 'TypeError' ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('NetworkError');

      if (isIdempotent && attempt < maxRetries && isNet) {
        attempt++;
        const backoff = attempt * 400;
        console.warn(`[MedVerify API Client] Retrying ${method} ${url} after network interruption in ${backoff}ms...`);
        await sleep(backoff);
        continue;
      }

      console.error('[MedVerify API Client] Network or Fetch Error:', { url, method, error: err });
      const code: ApiErrorCode = isAbort ? 'TIMEOUT' : 'NETWORK_ERROR';
      const message = isAbort
        ? 'The request took too long to complete and timed out. Your request was preserved.'
        : err?.message || 'Failed to connect to MedVerify API.';

      throw new MedVerifyApiError(message, code, {
        url,
        isNetworkError: true,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Health and Readiness Helpers
// ---------------------------------------------------------------------------

export interface BackendHealthStatus {
  isAlive: boolean;
  isReady: boolean;
  databaseStatus: 'connected' | 'disconnected' | 'unknown';
  service: string;
  version?: string;
  latencyMs?: number;
  uptimeSeconds?: number;
  error?: string;
}

export async function checkBackendHealth(): Promise<BackendHealthStatus> {
  const liveUrl = buildEndpointUrl('/health/live');
  try {
    const liveRes = await fetch(liveUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!liveRes.ok) {
      return {
        isAlive: false,
        isReady: false,
        databaseStatus: 'unknown',
        service: 'medverify-api',
        error: `Liveness returned HTTP ${liveRes.status}`,
      };
    }
    const liveData = await liveRes.json().catch(() => ({}));
    if (liveData.status !== 'alive') {
      return {
        isAlive: false,
        isReady: false,
        databaseStatus: 'unknown',
        service: 'medverify-api',
        error: 'Unexpected liveness payload',
      };
    }

    // Backend is alive; now probe readiness
    const readyUrl = buildEndpointUrl('/health/ready');
    const readyRes = await fetch(readyUrl, {
      headers: { Accept: 'application/json' },
    });
    const readyData = await readyRes.json().catch(() => ({}));
    const isReady = readyRes.status === 200 && readyData.status === 'ready';

    return {
      isAlive: true,
      isReady,
      databaseStatus: readyData.database?.status || (isReady ? 'connected' : 'disconnected'),
      service: readyData.service || 'medverify-api',
      version: readyData.version || liveData.version || '1.0.0',
      latencyMs: readyData.database?.latency_ms,
      uptimeSeconds: liveData.uptime_seconds,
      error: isReady ? undefined : readyData.database?.error || 'Database service disconnected',
    };
  } catch (err: any) {
    return {
      isAlive: false,
      isReady: false,
      databaseStatus: 'unknown',
      service: 'medverify-api',
      error: err?.message || 'Connection refused',
    };
  }
}

export async function checkHealth(): Promise<{ status: string; version?: string }> {
  try {
    return await apiFetch<{ status: string; version?: string }>('/api/health');
  } catch {
    return apiFetch<{ status: string; version?: string }>('/health');
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export async function verifyMedicine(req: VerifyRequest): Promise<VerificationResult> {
  return apiFetch<VerificationResult>('/api/verify', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function getVerification(id: string): Promise<VerificationResult> {
  return apiFetch<VerificationResult>(`/api/verifications/${id}`);
}

export async function getVerifications(
  params: { status?: string; page?: number; limit?: number } = {},
): Promise<VerificationHistoryResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<VerificationHistoryResponse>(`/api/verifications${q ? `?${q}` : ''}`);
}

// ---------------------------------------------------------------------------
// Medicines
// ---------------------------------------------------------------------------

export async function getMedicine(id: string): Promise<Medicine> {
  return apiFetch<Medicine>(`/api/medicines/${id}`);
}

export async function getMedicines(): Promise<Medicine[]> {
  return apiFetch<Medicine[]>('/api/medicines');
}

// ---------------------------------------------------------------------------
// User Scoped APIs
// ---------------------------------------------------------------------------

export async function getUserStats(): Promise<import('../types').UserStats> {
  return apiFetch<import('../types').UserStats>('/api/user/stats');
}

export async function getUserHistory(
  params: { status?: string; search?: string; page?: number; limit?: number } = {},
): Promise<VerificationHistoryResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<VerificationHistoryResponse>(`/api/user/history${q ? `?${q}` : ''}`);
}

export async function getUserProfile(): Promise<import('../types').UserProfile> {
  return apiFetch<import('../types').UserProfile>('/api/user/profile');
}

export async function getUserRecent(limit = 5): Promise<{ recent: any[] }> {
  return apiFetch<{ recent: any[] }>(`/api/user/recent?limit=${limit}`);
}

// ---------------------------------------------------------------------------
// Medicine Cabinet
// ---------------------------------------------------------------------------

export async function getCabinet(): Promise<CabinetEntry[]> {
  return apiFetch<CabinetEntry[]>('/api/user/cabinet');
}

export async function addToCabinet(data: {
  medicine_id?: string;
  verification_id?: string;
  nickname?: string;
  notes?: string;
  expiry_date?: string;
  product_name?: string;
  manufacturer?: string;
  batch_number?: string;
  reminder_enabled?: boolean;
}): Promise<CabinetEntry> {
  return apiFetch<CabinetEntry>('/api/user/cabinet', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCabinetEntry(
  id: string,
  data: { nickname?: string; notes?: string; reminder_enabled?: boolean },
): Promise<CabinetEntry> {
  return apiFetch<CabinetEntry>(`/api/user/cabinet/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function removeCabinetEntry(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/user/cabinet/${id}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>('/api/user/notifications/preferences');
}

export async function updateNotificationPreferences(
  data: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>('/api/user/notifications/preferences', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function submitReport(data: {
  verification_id?: string;
  report_type?: string;
  description: string;
}): Promise<VerificationReport> {
  return apiFetch<VerificationReport>('/api/reports', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getMyReports(): Promise<VerificationReport[]> {
  return apiFetch<VerificationReport[]>('/api/user/reports');
}

// ---------------------------------------------------------------------------
// Admin Scoped APIs
// ---------------------------------------------------------------------------

export async function getAdminMedicines(): Promise<Medicine[]> {
  return apiFetch<Medicine[]>('/api/admin/medicines');
}

export async function createMedicine(data: Record<string, unknown>): Promise<Medicine> {
  return apiFetch<Medicine>('/api/admin/medicines', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMedicine(id: string, data: Record<string, unknown>): Promise<Medicine> {
  return apiFetch<Medicine>(`/api/admin/medicines/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteMedicine(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/admin/medicines/${id}`, { method: 'DELETE' });
}

export async function reactivateMedicine(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/admin/medicines/${id}/reactivate`, { method: 'POST' });
}

export async function getAnalytics(): Promise<AnalyticsData> {
  return apiFetch<AnalyticsData>('/api/admin/analytics');
}

export async function getAdminUsers(): Promise<{ users: import('../types').AdminUserItem[]; total: number }> {
  return apiFetch<{ users: import('../types').AdminUserItem[]; total: number }>('/api/admin/users');
}

export async function createAdminUser(data: {
  name: string;
  email: string;
  password: string;
  role?: string;
}): Promise<import('../types').AdminUserItem> {
  return apiFetch<import('../types').AdminUserItem>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUserStatus(
  userId: string,
  status: 'active' | 'disabled',
): Promise<{ id: string; status: string; message: string }> {
  return apiFetch<{ id: string; status: string; message: string }>(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateUserRole(
  userId: string,
  role: 'user' | 'admin',
): Promise<{ id: string; role: string; message: string }> {
  return apiFetch<{ id: string; role: string; message: string }>(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function getAdminAudit(
  params: { status?: string; user_id?: string; search?: string; page?: number; limit?: number } = {},
): Promise<VerificationHistoryResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.user_id) qs.set('user_id', params.user_id);
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<VerificationHistoryResponse>(`/api/admin/audit${q ? `?${q}` : ''}`);
}

export async function getAdminSystemHealth(): Promise<import('../types').SystemHealthData> {
  return apiFetch<import('../types').SystemHealthData>('/api/admin/system-health');
}

export async function getAdminReports(): Promise<VerificationReport[]> {
  return apiFetch<VerificationReport[]>('/api/admin/reports');
}

export async function getAdminInvestigation(
  verificationId: string,
): Promise<import('../types').VerificationInvestigation> {
  return apiFetch<import('../types').VerificationInvestigation>(
    `/api/admin/investigation/${verificationId}`,
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. If Supabase is configured, attempt Supabase Auth authentication first
  if (isSupabaseConfigured() && supabase) {
    try {
      console.log('[MedVerify Auth] Attempting Supabase authentication for:', cleanEmail);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        console.warn('[MedVerify Auth] Supabase auth returned notice, trying API login:', error.message);
      } else if (data.session && data.user) {
        const token = data.session.access_token;
        const uid = data.user.id;

        // Fetch user profile from Supabase profiles table
        let role: 'user' | 'admin' = (data.user.user_metadata?.role as any) || 'user';
        let name = data.user.user_metadata?.full_name || data.user.user_metadata?.name || cleanEmail.split('@')[0];

        try {
          const profileRes = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
          if (profileRes.data) {
            role = profileRes.data.role === 'admin' ? 'admin' : 'user';
            name = profileRes.data.full_name || profileRes.data.name || name;
          }
        } catch (pErr) {
          console.warn('[MedVerify Auth] Supabase profile table read warning:', pErr);
        }

        const userObj: User = {
          id: uid,
          name,
          email: data.user.email || cleanEmail,
          role,
          created_at: data.user.created_at || new Date().toISOString(),
        };

        localStorage.setItem('medverify_token', token);
        localStorage.setItem('medverify_user', JSON.stringify(userObj));
        console.log('[MedVerify Auth] Supabase sign-in successful. Retrieved user ID:', uid, 'Role:', role);

        return {
          access_token: token,
          token_type: 'bearer',
          user: userObj,
        };
      }
    } catch (sbErr) {
      console.warn('[MedVerify Auth] Supabase auth exception, falling back to API:', sbErr);
    }
  }

  // 2. Primary / Fallback API Auth
  const resp = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: cleanEmail, password }),
  });

  localStorage.setItem('medverify_token', resp.access_token);
  localStorage.setItem('medverify_user', JSON.stringify(resp.user));
  console.log('[MedVerify Auth] API sign-in successful. Retrieved user ID:', resp.user.id, 'Role:', resp.user.role);
  return resp;
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase();

  // If Supabase is configured, attempt Supabase Auth registration
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { full_name: name, role: 'user' },
        },
      });

      if (!error && data.session && data.user) {
        const token = data.session.access_token;
        const userObj: User = {
          id: data.user.id,
          name,
          email: cleanEmail,
          role: 'user',
          created_at: data.user.created_at || new Date().toISOString(),
        };
        localStorage.setItem('medverify_token', token);
        localStorage.setItem('medverify_user', JSON.stringify(userObj));
        console.log('[MedVerify Auth] Supabase registration successful. User ID:', data.user.id);
        return {
          access_token: token,
          token_type: 'bearer',
          user: userObj,
        };
      }
    } catch (sbErr) {
      console.warn('[MedVerify Auth] Supabase signUp exception, using API register:', sbErr);
    }
  }

  const resp = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email: cleanEmail, password }),
  });
  localStorage.setItem('medverify_token', resp.access_token);
  localStorage.setItem('medverify_user', JSON.stringify(resp.user));
  console.log('[MedVerify Auth] API registration successful. User ID:', resp.user.id, 'Role:', resp.user.role);
  return resp;
}

export async function logout(): Promise<void> {
  console.log('[MedVerify Auth] Performing logout...');
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[MedVerify Auth] Supabase signOut error:', error);
        throw error;
      }
    } catch (e) {
      console.error('[MedVerify Auth] Supabase signOut error:', e);
      throw e;
    }
  }
  localStorage.removeItem('medverify_token');
  localStorage.removeItem('medverify_user');
  console.log('[MedVerify Auth] User logged out and local session cleared.');
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem('medverify_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('medverify_token');
}

export async function fetchCurrentProfile(): Promise<User> {
  const token = localStorage.getItem('medverify_token');
  if (!token) throw new Error('No authentication token found.');

  // Try API /api/auth/me
  try {
    const res = await apiFetch<User>('/api/auth/me');
    if (res && res.id) {
      localStorage.setItem('medverify_user', JSON.stringify(res));
      return res;
    }
  } catch (apiErr: any) {
    // If Supabase is configured, try Supabase session
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
          const role: 'user' | 'admin' = profile?.role === 'admin' ? 'admin' : 'user';
          const userObj: User = {
            id: user.id,
            name: profile?.full_name || profile?.name || user.email?.split('@')[0] || 'Verified User',
            email: user.email || '',
            role,
            created_at: profile?.created_at || user.created_at || new Date().toISOString(),
          };
          localStorage.setItem('medverify_user', JSON.stringify(userObj));
          return userObj;
        }
      } catch (sbErr) {
        console.warn('[MedVerify Auth] Supabase getUser failed:', sbErr);
      }
    }
    throw apiErr;
  }
  throw new Error('Unable to retrieve user verification profile.');
}

// ---------------------------------------------------------------------------
// MedVerify Real LLM Intelligence Layer APIs
// ---------------------------------------------------------------------------

export async function getAIHealth(): Promise<import('../types').AIHealthResponse> {
  return apiFetch<import('../types').AIHealthResponse>('/api/ai/health');
}

export async function explainVerification(data: {
  verification_id: string;
  style?: 'simple' | 'technical';
  language?: string;
}): Promise<import('../types').VerificationExplanation> {
  return apiFetch<import('../types').VerificationExplanation>('/api/ai/explain-verification', {
    method: 'POST',
    body: JSON.stringify(data),
    timeoutMs: AI_TIMEOUT_MS,
  });
}

export async function askMedVerify(data: {
  question: string;
  verification_id?: string;
  conversation_id?: string;
  language?: string;
}): Promise<import('../types').AskMedVerifyResponse> {
  return apiFetch<import('../types').AskMedVerifyResponse>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify(data),
    timeoutMs: AI_TIMEOUT_MS,
  });
}

export async function normalizeOCR(data: {
  raw_text: string;
}): Promise<import('../types').OCRNormalizedCandidate> {
  return apiFetch<import('../types').OCRNormalizedCandidate>('/api/ai/normalize-ocr', {
    method: 'POST',
    body: JSON.stringify(data),
    timeoutMs: AI_TIMEOUT_MS,
  });
}

export async function adminAIAnalyze(data: {
  query: string;
  time_range?: string;
}): Promise<import('../types').AdminAIAnalyzeResponse> {
  return apiFetch<import('../types').AdminAIAnalyzeResponse>('/api/admin/ai/analyze', {
    method: 'POST',
    body: JSON.stringify(data),
    timeoutMs: AI_TIMEOUT_MS,
  });
}

// ---------------------------------------------------------------------------
// Medicine Image Verification Client APIs
// ---------------------------------------------------------------------------

export async function uploadPackagingImages(
  files: File[],
  slots: string[] = [],
  batchId?: string
): Promise<{ batch_id: string; user_id: string; uploaded_count: number; images: any[] }> {
  const token = localStorage.getItem('medverify_token');
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  slots.forEach((slot) => formData.append('slots', slot));
  if (batchId) formData.append('batch_id', batchId);

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(buildEndpointUrl('/api/image-verification/upload'), {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Image upload failed');
  }
  return res.json();
}

export async function analyzePackagingBatch(
  batchId: string
): Promise<import('../types').ImageAnalysisResult> {
  return apiFetch<import('../types').ImageAnalysisResult>(`/api/image-verification/analyze/${batchId}`, {
    method: 'POST',
  });
}

export async function confirmAndVerifyImage(data: {
  analysis_id: string;
  batch_id: string;
  confirmed_fields: {
    product_name?: string;
    gtin?: string;
    batch_number?: string;
    serial_number?: string;
    expiry_date?: string;
    manufacturer?: string;
  };
  raw_identifier?: string;
}): Promise<import('../types').ImageVerificationCombinedResult> {
  return apiFetch<import('../types').ImageVerificationCombinedResult>(
    '/api/image-verification/confirm-and-verify',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function getPackagingAnalysis(
  analysisId: string
): Promise<import('../types').ImageAnalysisResult> {
  return apiFetch<import('../types').ImageAnalysisResult>(
    `/api/image-verification/analysis/${analysisId}`
  );
}

