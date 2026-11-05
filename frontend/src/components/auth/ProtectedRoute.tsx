import React from 'react';
import { Navigate, useLocation } from '../../router';
import { useAuth } from '../../context/AuthContext';
import { Loader2, AlertCircle, RefreshCw, LogOut, ShieldCheck } from 'lucide-react';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
}

/**
 * Primary Route Guard for MedVerify.
 * - Enforces authentication
 * - Protects role-specific routes (admin vs user)
 * - Handles asynchronous session verification gracefully without premature redirects
 * - Surfaces meaningful error states when profile retrieval fails
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
}) => {
  const { user, isAuthenticated, isLoading, isSigningOut, profileError, retryProfile, logout } = useAuth();
  const location = useLocation();

  // 1. Asynchronous profile & session verification in progress
  if (isLoading) {
    return (
      <div
        className="auth-loading-screen"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#F5F6F2',
          color: '#202B27',
          fontFamily: 'var(--font-sans)',
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: '#E8F3EC',
            color: '#176B4D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Loader2 size={24} className="animate-spin" />
        </div>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: '#202B27' }}>
            Verifying MedVerify Credentials
          </h3>
          <p style={{ fontSize: '13px', color: '#64716A', margin: 0 }}>
            Validating encrypted clinical session and security clearance...
          </p>
        </div>
      </div>
    );
  }

  // 2. Profile retrieval failed with an error -> Display error instead of silently redirecting to landing page
  if (profileError && !user) {
    console.error('[MedVerify Route Guard] Profile retrieval failed for route:', location.pathname, profileError);
    return (
      <div
        className="auth-error-screen"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#F5F6F2',
          color: '#202B27',
          fontFamily: 'var(--font-sans)',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '460px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E1E7E1',
            padding: '32px 28px',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              backgroundColor: 'rgba(217, 76, 76, 0.1)',
              color: '#D94C4C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertCircle size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px', color: '#202B27' }}>
              Profile Retrieval Failed
            </h3>
            <p style={{ fontSize: '13px', color: '#64716A', margin: 0, lineHeight: 1.5 }}>
              {profileError}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              onClick={() => retryProfile()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: '#176B4D',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                border: 'none',
              }}
            >
              <RefreshCw size={14} />
              <span>Retry Verification</span>
            </button>
            <button
              type="button"
              onClick={() => logout()}
              disabled={isSigningOut}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: '#EEF2ED',
                color: '#64716A',
                fontWeight: 600,
                fontSize: '13px',
                cursor: isSigningOut ? 'not-allowed' : 'pointer',
                opacity: isSigningOut ? 0.6 : 1,
                border: '1px solid #E1E7E1',
              }}
            >
              {isSigningOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
              <span>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Unauthenticated access -> Redirect to login with original route preserved in query
  if (!isAuthenticated || !user) {
    console.log(
      `[MedVerify Route Guard] Unauthenticated access to ${location.pathname} -> redirecting to /login`,
    );
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // 4. Admin route protection: Normal user attempting admin access
  if (requiredRole === 'admin' && user.role !== 'admin') {
    console.warn(
      `[MedVerify Route Guard] Access denied: User ${user.email} with role '${user.role}' attempted to access admin route ${location.pathname} -> redirecting to /verify`,
    );
    return <Navigate to="/verify" replace />;
  }

  console.log(
    `[MedVerify Route Guard] Access granted: User ${user.email} (ID: ${user.id}, Role: ${user.role}) -> ${location.pathname}`,
  );
  return <>{children}</>;
};

/**
 * Dedicated Admin Route Guard
 */
export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute requiredRole="admin">{children}</ProtectedRoute>
);

/**
 * Dedicated User Route Guard
 */
export const UserRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute requiredRole="user">{children}</ProtectedRoute>
);

/**
 * Public Route Guard: Prevents already-logged-in users from seeing the login screen.
 * Redirects them directly to their appropriate role console.
 */
export const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // If session is actively being validated from existing stored credentials, hold rendering
  if (isLoading && isAuthenticated) {
    return null;
  }

  if (isAuthenticated && user) {
    const searchParams = new URLSearchParams(location.search);
    const redirectParam = searchParams.get('redirect');

    if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')) {
      if (redirectParam.startsWith('/admin') && user.role !== 'admin') {
        console.log('[MedVerify Route Guard] PublicRoute: Non-admin attempted /admin redirect -> sending to /verify');
        return <Navigate to="/verify" replace />;
      }
      console.log('[MedVerify Route Guard] PublicRoute: Forwarding authenticated user to redirect param:', redirectParam);
      return <Navigate to={redirectParam} replace />;
    }

    const destination = user.role === 'admin' ? '/admin' : '/verify';
    console.log(
      `[MedVerify Route Guard] PublicRoute: User already authenticated (${user.email}, ${user.role}) -> redirecting to ${destination}`,
    );
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
