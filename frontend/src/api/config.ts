/**
 * MedVerify Centralized API Configuration
 *
 * Provides a single source of truth for:
 * - Environment detection (development vs production)
 * - Base API URL resolution
 * - Consistent endpoint building across all services
 * - Validation of production configuration during startup
 */

const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim();
const IS_PROD = import.meta.env.PROD;
const IS_DEV = import.meta.env.DEV;

/**
 * Clean normalized base URL without trailing slash.
 * In development, if VITE_API_URL is empty or not set, relative URLs are used
 * so that Vite's reverse proxy forwards requests seamlessly without CORS issues.
 */
export const API_BASE_URL: string = (() => {
  if (RAW_API_URL) {
    return RAW_API_URL.replace(/\/+$/, '');
  }
  // In development without an explicit base URL, use empty string to let Vite proxy handle /api
  if (IS_DEV) {
    return '';
  }
  // In production, warn if base URL is missing
  console.warn(
    '[MedVerify API Config] Warning: VITE_API_URL is not set in production. ' +
    'API calls will default to current origin relative paths.'
  );
  return '';
})();

/**
 * Validates the API configuration at runtime.
 * Returns an object with status and diagnostic details.
 */
export interface ConfigValidationResult {
  valid: boolean;
  mode: string;
  baseUrl: string;
  errors: string[];
  warnings: string[];
}

export function validateApiConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mode = import.meta.env.MODE || (IS_PROD ? 'production' : 'development');

  if (IS_PROD) {
    if (!RAW_API_URL) {
      warnings.push('VITE_API_URL is not defined in production. Ensure the frontend and backend are co-hosted or reverse-proxied under the same origin.');
    } else {
      if (!RAW_API_URL.startsWith('https://')) {
        warnings.push(`Production VITE_API_URL '${RAW_API_URL}' is not using HTTPS. Production deployments require secure HTTPS transport.`);
      }
      if (RAW_API_URL.includes('localhost') || RAW_API_URL.includes('127.0.0.1')) {
        errors.push(`Production VITE_API_URL '${RAW_API_URL}' points to localhost. Deployments must point to a reachable public or internal domain.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    mode,
    baseUrl: API_BASE_URL,
    errors,
    warnings,
  };
}

/**
 * Constructs a fully qualified or proxy-relative endpoint URL.
 * Handles leading/trailing slashes cleanly and prevents duplicate /api prefixes.
 */
export function buildEndpointUrl(path: string): string {
  // Return absolute URLs as is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!API_BASE_URL) {
    return normalizedPath;
  }

  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * Centralized endpoint definitions used across all services
 */
export const API_ENDPOINTS = {
  // Health & Diagnostics
  health: '/health',
  apiHealth: '/api/health',
  healthLive: '/health/live',
  healthReady: '/health/ready',

  // Authentication
  login: '/api/auth/login',
  register: '/api/auth/register',
  me: '/api/auth/me',

  // Medicine Verification
  verify: '/api/verify',
  verifications: '/api/verifications',
  verificationDetail: (id: string) => `/api/verifications/${id}`,

  // Medicines Catalog
  medicines: '/api/medicines',
  medicineDetail: (id: string) => `/api/medicines/${id}`,

  // User Profile, Cabinet & History
  userStats: '/api/user/stats',
  userHistory: '/api/user/history',
  userProfile: '/api/user/profile',
  userRecent: '/api/user/recent',
  cabinet: '/api/user/cabinet',
  cabinetDetail: (id: string) => `/api/user/cabinet/${id}`,
  notificationsPreferences: '/api/user/notifications/preferences',
  reports: '/api/reports',
  userReports: '/api/user/reports',

  // Admin Operations
  adminMedicines: '/api/admin/medicines',
  adminMedicineDetail: (id: string) => `/api/admin/medicines/${id}`,
  adminMedicineReactivate: (id: string) => `/api/admin/medicines/${id}/reactivate`,
  adminUsers: '/api/admin/users',
  adminUserStatus: (userId: string) => `/api/admin/users/${userId}/status`,
  adminUserRole: (userId: string) => `/api/admin/users/${userId}/role`,
  adminAnalytics: '/api/admin/analytics',
  adminAudit: '/api/admin/audit',
  adminSystemHealth: '/api/admin/system-health',
  adminReports: '/api/admin/reports',
  adminInvestigation: (id: string) => `/api/admin/investigation/${id}`,
  adminAiAnalyze: '/api/admin/ai/analyze',

  // AI & Gemini Services
  aiChat: '/api/ai/chat',
  aiChatStream: '/api/ai/chat/stream',
  aiExplain: '/api/ai/explain-verification',
  aiNormalizeOcr: '/api/ai/normalize-ocr',
  aiHealth: '/api/ai/health',

  // Medicine Image Verification & Packaging OCR
  imageUpload: '/api/image-verification/upload',
  imageBatch: (batchId: string) => `/api/image-verification/batch/${batchId}`,
  imageAnalyze: (batchId: string) => `/api/image-verification/analyze/${batchId}`,
  imageAnalysisDetail: (analysisId: string) => `/api/image-verification/analysis/${analysisId}`,
  imageConfirmVerify: '/api/image-verification/confirm-and-verify',
  imageGet: (imageId: string) => `/api/image-verification/image/${imageId}`,
} as const;

