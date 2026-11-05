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

// ---------------------------------------------------------------------------
// Base fetch wrapper
// ---------------------------------------------------------------------------

const RAW_API_URL = import.meta.env.VITE_API_URL || '';
export const API_BASE_URL = RAW_API_URL.replace(/\/$/, '');

export function buildEndpointUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('medverify_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = buildEndpointUrl(path);

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (netErr: any) {
    console.error('[MedVerify API Client] Network connection failed:', { url, error: netErr });
    const err = new Error(netErr?.message || 'Failed to fetch');
    (err as any).isNetworkError = true;
    (err as any).url = url;
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errorDetail = body.detail || body.error?.message || `HTTP ${res.status}`;
    console.error('[MedVerify API Client] HTTP Error:', {
      url,
      status: res.status,
      statusText: res.statusText,
      detail: errorDetail,
      body,
    });
    const err = new Error(typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail));
    (err as any).status = res.status;
    (err as any).data = body;
    (err as any).url = url;
    throw err;
  }

  return res.json() as Promise<T>;
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
  });
}

export async function normalizeOCR(data: {
  raw_text: string;
}): Promise<import('../types').OCRNormalizedCandidate> {
  return apiFetch<import('../types').OCRNormalizedCandidate>('/api/ai/normalize-ocr', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminAIAnalyze(data: {
  query: string;
  time_range?: string;
}): Promise<import('../types').AdminAIAnalyzeResponse> {
  return apiFetch<import('../types').AdminAIAnalyzeResponse>('/api/admin/ai/analyze', {
    method: 'POST',
    body: JSON.stringify(data),
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

