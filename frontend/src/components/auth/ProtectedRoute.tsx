import React from 'react';
import { Navigate, useLocation } from '../../router';
import { isAuthenticated, getStoredUser } from '../../api/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
}) => {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  const user = getStoredUser();

  // If this route strictly requires admin role and current user is not admin
  if (requiredRole === 'admin' && user?.role !== 'admin') {
    console.warn(`[ProtectedRoute] Access denied: User ${user?.email} with role '${user?.role}' attempted to access admin route.`);
    return <Navigate to="/verify" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
