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
  AnalyticsData,
  CabinetEntry,
  NotificationPreferences,
  VerificationReport,
} from '../types';

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
  return apiFetch<{ status: string; version?: string }>('/health');
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

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<AuthResponse> {
  const resp = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem('medverify_token', resp.access_token);
  localStorage.setItem('medverify_user', JSON.stringify(resp.user));
  return resp;
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  const resp = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  localStorage.setItem('medverify_token', resp.access_token);
  localStorage.setItem('medverify_user', JSON.stringify(resp.user));
  return resp;
}

export function logout(): void {
  localStorage.removeItem('medverify_token');
  localStorage.removeItem('medverify_user');
}

export function getStoredUser(): import('../types').User | null {
  const raw = localStorage.getItem('medverify_user');
  return raw ? JSON.parse(raw) : null;
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('medverify_token');
}
