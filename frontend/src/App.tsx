import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from './router';
import { AnimatePresence } from 'framer-motion';

/* Layout Shells */
import UserShell from './components/layout/UserShell';
import AdminShell from './components/layout/AdminShell';

/* Route Protection */
import ProtectedRoute from './components/auth/ProtectedRoute';

/* Public Pages */
import Landing from './pages/Landing';
import Login from './pages/Login';
import VerificationResult from './pages/VerificationResult';

/* User Role Pages */
import UserHome from './pages/user/UserHome';
import UserHistory from './pages/user/UserHistory';
import HowItWorks from './pages/user/HowItWorks';
import UserProfile from './pages/user/UserProfile';
import Scanner from './pages/Scanner';

/* Admin Role Pages */
import AdminCommandCenter from './pages/admin/AdminCommandCenter';
import AdminRegistry from './pages/admin/AdminRegistry';
import AdminUsers from './pages/admin/AdminUsers';
import AdminAudit from './pages/admin/AdminAudit';
import AdminSystemHealth from './pages/admin/AdminSystemHealth';
import About from './pages/About';

export default function App() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Routes>
          {/* Public Landing & Login */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />

          {/* ============================================================== */}
          {/* USER PORTAL — Consumer / Pharmacist Verification Experience    */}
          {/* ============================================================== */}
          <Route
            path="/app"
            element={
              <ProtectedRoute requiredRole="user">
                <UserShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<UserHome />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="history" element={<UserHistory />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="profile" element={<UserProfile />} />
            <Route path="result/:id" element={<VerificationResult />} />
          </Route>

          {/* ============================================================== */}
          {/* ADMIN CONSOLE — Operational Command Center & Platform Control  */}
          {/* ============================================================== */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminCommandCenter />} />
            <Route path="registry" element={<AdminRegistry />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="system" element={<AdminSystemHealth />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="specs" element={<About />} />
            <Route path="result/:id" element={<VerificationResult />} />
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  );
}
