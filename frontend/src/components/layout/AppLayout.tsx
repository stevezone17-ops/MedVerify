import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from '../../router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ScanLine,
  ClipboardList,
  Database,
  Info,
  LayoutDashboard,
  LogOut,
  Bell,
  Search,
  ExternalLink,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { getStoredUser, logout } from '../../api/client';
import type { User } from '../../types';
import CommandPalette from '../ui/CommandPalette';
import { pulseVariants } from '../../animations/motion';

interface RailNavItem {
  id: string;
  label: string;
  to: string;
  icon: typeof ScanLine;
  badge?: string;
  adminOnly?: boolean;
}

const RAIL_NAV_ITEMS: RailNavItem[] = [
  {
    id: 'admin',
    label: 'Command Center',
    to: '/app/admin',
    icon: LayoutDashboard,
    adminOnly: true,
  },
  {
    id: 'scanner',
    label: 'Precision Scanner',
    to: '/app/scanner',
    icon: ScanLine,
  },
  {
    id: 'history',
    label: 'Audit History',
    to: '/app/history',
    icon: ClipboardList,
  },
  {
    id: 'registry',
    label: 'Product Registry',
    to: '/app/registry',
    icon: Database,
  },
  {
    id: 'about',
    label: 'Engine Specs',
    to: '/app/about',
    icon: Info,
  },
];

const SECTION_TITLES: Record<string, { eyebrow: string; title: string }> = {
  '/app/admin': {
    eyebrow: 'MEDVERIFY / ADMINISTRATION',
    title: 'Command Center',
  },
  '/app/scanner': {
    eyebrow: 'MEDVERIFY / AUTHENTICATION',
    title: 'Precision Scanner',
  },
  '/app/history': {
    eyebrow: 'MEDVERIFY / AUDIT TRAIL',
    title: 'Audit History',
  },
  '/app/registry': {
    eyebrow: 'MEDVERIFY / CATALOG',
    title: 'Authorized Registry',
  },
  '/app/about': {
    eyebrow: 'MEDVERIFY / ARCHITECTURE',
    title: 'Engine Specifications',
  },
};

export const AppLayout: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const currentSection =
    Object.entries(SECTION_TITLES).find(([path]) => location.pathname.startsWith(path))?.[1] || {
      eyebrow: 'MEDVERIFY / PLATFORM',
      title: 'Console',
    };

  return (
    <div className="command-console-shell">
      {/* 1. SLIM LEFT ICON RAIL (68px) */}
      <aside className="console-rail" aria-label="Console Navigation Rail">
        {/* Brand Shield Icon */}
        <div className="console-rail__brand">
          <a
            href="/"
            className="rail-brand-link"
            title="MedVerify Public Portal"
            aria-label="MedVerify Public Portal"
          >
            <div className="rail-shield-icon">
              <Shield size={22} strokeWidth={2.4} />
            </div>
          </a>
        </div>

        {/* Rail Nav Items */}
        <nav className="console-rail__nav" role="navigation">
          {RAIL_NAV_ITEMS.map((item) => {
            if (item.adminOnly && user?.role !== 'admin') return null;

            const Icon = item.icon;
            const isActive =
              location.pathname === item.to ||
              (item.to !== '/app' && location.pathname.startsWith(item.to));

            return (
              <NavLink
                key={item.id}
                to={item.to}
                className={`rail-nav-btn ${isActive ? 'is-active' : ''}`}
                aria-label={item.label}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeRailIndicator"
                    className="rail-active-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon size={20} className="rail-nav-icon" />

                {/* Micro tooltip on hover */}
                <span className="rail-tooltip" role="tooltip">
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* Rail Footer */}
        <div className="console-rail__footer">
          <a
            href="/"
            className="rail-footer-btn"
            title="Public Homepage"
            aria-label="Public Homepage"
          >
            <ExternalLink size={16} />
            <span className="rail-tooltip" role="tooltip">
              Public Portal
            </span>
          </a>

          <button
            type="button"
            className="rail-footer-btn rail-footer-btn--logout"
            onClick={handleLogout}
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut size={16} />
            <span className="rail-tooltip" role="tooltip">
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN APP CONTAINER */}
      <div className="console-main-container">
        {/* SLIM TOP COMMAND BAR */}
        <header className="console-top-bar" role="banner">
          {/* Left: Section Eyebrow & Title */}
          <div className="console-top-bar__left">
            <button
              type="button"
              className="btn btn-ghost btn-icon mobile-menu-toggle"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <div className="console-title-group">
              <span className="console-eyebrow">{currentSection.eyebrow}</span>
              <h2 className="console-section-heading">{currentSection.title}</h2>
            </div>
          </div>

          {/* Center: Command Palette Search Bar */}
          <div className="console-top-bar__center">
            <button
              type="button"
              className="console-search-trigger"
              onClick={() => setIsCommandPaletteOpen(true)}
              aria-label="Open Command Search (Ctrl+K)"
            >
              <Search size={14} className="console-search-icon" aria-hidden="true" />
              <span className="console-search-placeholder">
                Scan GTIN, batch, serial, or actions...
              </span>
              <kbd className="console-search-kbd">Ctrl K</kbd>
            </button>
          </div>

          {/* Right: Engine Telemetry Status, Notifications, Avatar */}
          <div className="console-top-bar__right">
            {/* Engine Status indicator */}
            <div
              className="console-engine-status"
              title="MedVerify Verification Engine operational and synchronized with MongoDB"
            >
              <motion.span
                variants={pulseVariants}
                initial="initial"
                animate="animate"
                className="console-engine-dot"
                aria-hidden="true"
              />
              <span className="console-engine-text">ENGINE ONLINE</span>
            </div>

            {/* Notification Bell */}
            <button
              type="button"
              className="btn btn-ghost btn-icon console-bell-btn"
              title="System Notifications"
              aria-label="System Notifications"
            >
              <Bell size={17} />
              <span className="console-bell-dot" />
            </button>

            {/* User Profile Pill */}
            <div className="console-user-pill" title={`Signed in as ${user?.name || 'Operator'}`}>
              <div className="console-avatar">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'O'}
              </div>
              <div className="console-user-info">
                <span className="console-user-name">{user?.name || 'Verified Operator'}</span>
                <span className="console-user-role">{user?.role === 'admin' ? 'Administrator' : 'Verifier'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mobile-nav-panel"
            >
              {RAIL_NAV_ITEMS.map((item) => {
                if (item.adminOnly && user?.role !== 'admin') return null;
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.to);

                return (
                  <NavLink
                    key={item.id}
                    to={item.to}
                    className={`mobile-nav-link ${isActive ? 'is-active' : ''}`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
              <button
                type="button"
                className="mobile-nav-link mobile-nav-link--logout"
                onClick={handleLogout}
              >
                <LogOut size={18} />
                <span>Sign Out</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Render page contents */}
        <main className="console-content-viewport" id="main-content">
          <Outlet />
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
};

export default AppLayout;
