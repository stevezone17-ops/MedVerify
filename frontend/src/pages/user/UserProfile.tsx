import React, { useEffect, useState } from 'react';
import {
  User as UserIcon,
  Mail,
  Shield,
  Clock,
  CheckCircle2,
  Calendar,
  LogOut,
  Key,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { useNavigate, Link } from '../../router';
import { getUserProfile, logout, getStoredUser } from '../../api/client';
import type { UserProfile as UserProfileType } from '../../types';

export const UserProfile: React.FC = () => {
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const storedUser = getStoredUser();
  const navigate = useNavigate();

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        setProfile(p);
        setLoading(false);
      })
      .catch((e) => {
        console.error('Failed to load profile:', e);
        setLoading(false);
      });
  }, []);

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="user-profile-container">
      <div className="user-profile-header">
        <span className="user-profile-eyebrow">MEDVERIFY / ACCOUNT DETAILS</span>
        <h1 className="user-profile-title">Personal Profile</h1>
        <p className="user-profile-subtitle">
          Manage your verified account credentials, personal activity summary, and security settings.
        </p>
      </div>

      <div className="user-profile-grid">
        {/* Main Profile Card */}
        <div className="user-profile-card">
          <div className="user-profile-badge-row">
            <div className="user-profile-avatar-lg">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="user-profile-name-group">
              <h2 className="user-profile-name">{profile?.name || storedUser?.name || 'Verified User'}</h2>
              <div className="user-profile-badges">
                <span className="user-profile-role-tag">
                  {profile?.role === 'admin' ? 'Administrator' : 'Verified Consumer'}
                </span>
                <span className="user-profile-status-tag">
                  <span className="user-status-dot" />
                  Account Active
                </span>
              </div>
            </div>
          </div>

          <div className="user-profile-field-list">
            <div className="user-profile-field">
              <div className="user-profile-field-label">
                <Mail size={16} />
                <span>Email Address</span>
              </div>
              <div className="user-profile-field-value">{profile?.email || storedUser?.email || 'N/A'}</div>
            </div>

            <div className="user-profile-field">
              <div className="user-profile-field-label">
                <Shield size={16} />
                <span>Account ID</span>
              </div>
              <div className="user-profile-field-value">
                <code>{profile?.id || storedUser?.id || 'user_demo01'}</code>
              </div>
            </div>

            <div className="user-profile-field">
              <div className="user-profile-field-label">
                <Calendar size={16} />
                <span>Member Since</span>
              </div>
              <div className="user-profile-field-value">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Active Member'}
              </div>
            </div>

            <div className="user-profile-field">
              <div className="user-profile-field-label">
                <Clock size={16} />
                <span>Last Activity</span>
              </div>
              <div className="user-profile-field-value">
                {profile?.last_activity ? new Date(profile.last_activity).toLocaleString() : 'Recent Session'}
              </div>
            </div>
          </div>

          <div className="user-profile-actions">
            <button onClick={handleSignOut} className="user-profile-logout-btn">
              <LogOut size={16} />
              <span>Sign Out of Account</span>
            </button>
          </div>
        </div>

        {/* Verification Summary & Quick Actions */}
        <div className="user-profile-side-col">
          <div className="user-profile-summary-card">
            <h3>Verification Activity</h3>
            <div className="user-profile-kpi">
              <span className="user-profile-kpi-num">{loading ? '—' : profile?.total_verifications ?? 0}</span>
              <span className="user-profile-kpi-label">Total Medicine Packages Verified</span>
            </div>
            <p className="user-profile-kpi-sub">
              Every verification you perform is cryptographically logged and stored in your personal audit trail.
            </p>

            <Link to="/app/history" className="user-profile-history-link">
              <span>View My History Log</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="user-profile-security-card">
            <div className="user-profile-sec-head">
              <Key size={18} />
              <h4>Security Standard</h4>
            </div>
            <p>
              Your session is secured using JSON Web Tokens (JWT) signed with SHA-256 HMAC and role-based
              access controls (RBAC).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
