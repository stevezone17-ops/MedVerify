import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from '../../router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ScanLine,
  Package,
  History as HistoryIcon,
  HelpCircle,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  ExternalLink,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { getStoredUser, logout } from '../../api/client';
import type { User } from '../../types';

interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: React.ComponentType<any>;
}

const USER_NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    to: '/app',
    icon: Shield,
  },
  {
    id: 'scanner',
    label: 'Verify Medicine',
    to: '/app/scanner',
    icon: ScanLine,
  },
  {
    id: 'cabinet',
    label: 'Medicine Cabinet',
    to: '/app/cabinet',
    icon: Package,
  },
  {
    id: 'history',
    label: 'My Activity',
    to: '/app/history',
    icon: HistoryIcon,
  },
  {
    id: 'how-it-works',
    label: 'How It Works',
    to: '/app/how-it-works',
    icon: HelpCircle,
  },
];

export const UserShell: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (to: string) => {
    if (to === '/app') {
      return location.pathname === '/app' || location.pathname === '/app/';
    }
    return location.pathname.startsWith(to);
  };

  return (
    <div className="user-shell-root">
      {/* Top Navigation Bar */}
      <header className="user-shell-header">
        <div className="user-shell-header-content">
          <div className="user-shell-brand-group">
            <NavLink to="/app" className="user-shell-logo-link">
              <div className="user-shell-logo-mark">
                <Shield size={20} className="user-shell-logo-icon" />
              </div>
              <div className="user-shell-logo-text">
                <span className="user-shell-logo-title">MedVerify</span>
                <span className="user-shell-logo-subtitle">Medicine Authentication</span>
              </div>
            </NavLink>

            <div className="user-shell-trust-badge">
              <CheckCircle2 size={12} className="user-shell-trust-icon" />
              <span>Consumer Verification Portal</span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="user-shell-desktop-nav" aria-label="Main User Navigation">
            {USER_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={`user-shell-nav-link ${active ? 'active' : ''}`}
                >
                  <Icon size={16} className="user-shell-nav-icon" />
                  <span>{item.label}</span>
                  {active && (
                    <motion.div
                      layoutId="userNavIndicator"
                      className="user-shell-nav-indicator"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Right Action Items: User Profile & Logout */}
          <div className="user-shell-actions">
            {user?.role === 'admin' && (
              <NavLink to="/admin" className="user-shell-admin-switch-btn" title="Switch to Admin Command Center">
                <Lock size={13} />
                <span>Admin Console</span>
              </NavLink>
            )}

            <NavLink to="/app/profile" className="user-shell-user-pill">
              <div className="user-shell-avatar">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="user-shell-user-info">
                <span className="user-shell-user-name">{user?.name || 'Verified User'}</span>
                <span className="user-shell-user-role">Personal Account</span>
              </div>
            </NavLink>

            <button
              onClick={handleLogout}
              className="user-shell-logout-btn"
              title="Sign Out of MedVerify"
              aria-label="Sign out"
            >
              <LogOut size={16} />
              <span className="user-shell-logout-text">Sign Out</span>
            </button>

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="user-shell-mobile-toggle"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="user-shell-mobile-menu"
            >
              <div className="user-shell-mobile-nav-list">
                {USER_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  return (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`user-shell-mobile-nav-link ${active ? 'active' : ''}`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}

                <div className="user-shell-mobile-divider" />

                <NavLink
                  to="/app/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="user-shell-mobile-nav-link"
                >
                  <UserIcon size={18} />
                  <span>My Profile</span>
                </NavLink>

                {user?.role === 'admin' && (
                  <NavLink
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="user-shell-mobile-nav-link admin-link"
                  >
                    <Lock size={18} />
                    <span>Open Admin Console</span>
                  </NavLink>
                )}

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="user-shell-mobile-logout"
                >
                  <LogOut size={18} />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Page Area */}
      <main className="user-shell-main-content">
        <Outlet />
      </main>

      {/* Simple, Professional Footer */}
      <footer className="user-shell-footer">
        <div className="user-shell-footer-content">
          <div className="user-shell-footer-left">
            <span className="user-shell-footer-brand">MedVerify Consumer Trust System</span>
            <span className="user-shell-footer-sep">·</span>
            <span>GS1 Healthcare Standard Compliant</span>
          </div>
          <div className="user-shell-footer-right">
            <span>Official Pharmaceutical Verification Infrastructure</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default UserShell;
