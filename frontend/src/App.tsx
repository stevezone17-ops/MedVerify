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
import UserCabinet from './pages/user/UserCabinet';
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
          {/* USER PORTAL — Consumer Medicine Verification Experience        */}
          {/* Strict Separation: /verify, /activity, /cabinet, /how-it-works, /profile */}
          {/* ============================================================== */}
          <Route
            element={
              <ProtectedRoute requiredRole="user">
                <UserShell />
              </ProtectedRoute>
            }
          >
            <Route path="/verify" element={<UserHome />} />
            <Route path="/verify/scan" element={<Scanner />} />
            <Route path="/activity" element={<UserHistory />} />
            <Route path="/cabinet" element={<UserCabinet />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/profile" element={<UserProfile />} />
            <Route path="/result/:id" element={<VerificationResult />} />

            {/* Backwards-compatible /app routes */}
            <Route path="/app" element={<UserHome />} />
            <Route path="/app/scanner" element={<Scanner />} />
            <Route path="/app/cabinet" element={<UserCabinet />} />
            <Route path="/app/history" element={<UserHistory />} />
            <Route path="/app/how-it-works" element={<HowItWorks />} />
            <Route path="/app/profile" element={<UserProfile />} />
            <Route path="/app/result/:id" element={<VerificationResult />} />
          </Route>

          {/* ============================================================== */}
          {/* ADMIN CONSOLE — Operational Command Center & Platform Control  */}
          {/* Strict Separation: /admin, /admin/scanner, /admin/audit, etc. */}
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
            <Route path="system-health" element={<AdminSystemHealth />} />
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
