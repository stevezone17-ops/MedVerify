import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Mail,
  Calendar,
  Clock,
  Key,
  X,
  AlertTriangle,
} from 'lucide-react';
import { getAdminUsers, createAdminUser, updateUserStatus, updateUserRole } from '../../api/client';
import type { AdminUserItem } from '../../types';

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'user' | 'admin'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'disabled'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // New user form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'user' | 'admin'>('user');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await getAdminUsers();
      setUsers(res.users);
    } catch (e: any) {
      console.error('Failed to load users:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (user: AdminUserItem) => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    if (!window.confirm(`Are you sure you want to change ${user.name}'s account status to ${nextStatus.toUpperCase()}?`)) {
      return;
    }
    setActionLoading(user.id);
    try {
      await updateUserStatus(user.id, nextStatus);
      await fetchUsers();
    } catch (e: any) {
      alert(`Error updating user status: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleRole = async (user: AdminUserItem) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Change ${user.name}'s role from ${user.role.toUpperCase()} to ${nextRole.toUpperCase()}?`)) {
      return;
    }
    setActionLoading(user.id);
    try {
      await updateUserRole(user.id, nextRole);
      await fetchUsers();
    } catch (e: any) {
      alert(`Error updating user role: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      setFormError('Please fill in all required fields.');
      return;
    }

    if (formPassword.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    setFormSubmitting(true);
    try {
      await createAdminUser({
        name: formName.trim(),
        email: formEmail.trim(),
        password: formPassword,
        role: formRole,
      });
      setIsModalOpen(false);
      setFormName('');
      setFormEmail('');
      setFormPassword('');
      setFormRole('user');
      await fetchUsers();
    } catch (e: any) {
      setFormError(e.message || 'Failed to create user account.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.id.toLowerCase().includes(search.toLowerCase());

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="admin-users-container">
      {/* Page Header */}
      <div className="admin-users-header">
        <div>
          <span className="admin-users-eyebrow">MEDVERIFY / SECURITY & RBAC</span>
          <h1 className="admin-users-title">User Management</h1>
          <p className="admin-users-subtitle">
            Authorize operator access, control role permissions (Admin vs. User), and monitor authentication logs.
          </p>
        </div>

        <div className="admin-users-header-actions">
          <button onClick={fetchUsers} className="admin-users-refresh-btn" title="Refresh user list">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button onClick={() => setIsModalOpen(true)} className="admin-users-create-btn">
            <UserPlus size={16} />
            <span>Create New User</span>
          </button>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="admin-users-toolbar">
        <div className="admin-users-search-wrap">
          <Search size={16} className="admin-users-search-icon" />
          <input
            type="text"
            placeholder="Search by name, email, or user ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="admin-users-search-input"
          />
        </div>

        <div className="admin-users-filter-group">
          <div className="admin-users-filter-pills">
            <span className="admin-users-filter-label">ROLE:</span>
            {(['ALL', 'admin', 'user'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`admin-users-pill ${roleFilter === r ? 'active' : ''}`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="admin-users-filter-pills">
            <span className="admin-users-filter-label">STATUS:</span>
            {(['ALL', 'active', 'disabled'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`admin-users-pill ${statusFilter === s ? 'active' : ''}`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="admin-users-table-card">
        {loading ? (
          <div className="admin-users-loading">Loading system users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="admin-users-empty">No users found matching your filters.</div>
        ) : (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>USER / IDENTITY</th>
                  <th>ROLE</th>
                  <th>ACCOUNT STATUS</th>
                  <th>SCANS PERFORMED</th>
                  <th>CREATED DATE</th>
                  <th>LAST ACTIVITY</th>
                  <th style={{ textAlign: 'right' }}>OPERATOR ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isActioning = actionLoading === u.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="admin-user-cell">
                          <div className={`admin-user-avatar ${u.role}`}>
                            {u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <span className="admin-user-name">{u.name}</span>
                            <span className="admin-user-email">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`admin-role-badge ${u.role}`}>
                          {u.role === 'admin' ? 'SYSTEM ADMIN' : 'STANDARD USER'}
                        </span>
                      </td>

                      <td>
                        <span className={`admin-status-badge ${u.status}`}>
                          <span className="admin-status-dot" />
                          {u.status === 'active' ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      </td>

                      <td>
                        <span className="admin-user-scans-count">{u.verification_count}</span>
                        <span className="admin-user-scans-label"> verifications</span>
                      </td>

                      <td>
                        <span className="admin-user-date">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                        </span>
                      </td>

                      <td>
                        <span className="admin-user-date">
                          {u.last_activity ? new Date(u.last_activity).toLocaleString() : 'Never'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div className="admin-user-action-buttons">
                          <button
                            onClick={() => handleToggleRole(u)}
                            disabled={isActioning}
                            className="admin-action-btn secondary"
                            title="Toggle User / Admin Role"
                          >
                            {u.role === 'admin' ? 'Make User' : 'Make Admin'}
                          </button>

                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={isActioning}
                            className={`admin-action-btn ${u.status === 'active' ? 'danger' : 'success'}`}
                            title="Toggle Account Disabled / Enabled"
                          >
                            {u.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="admin-modal-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="admin-modal-card"
            >
              <div className="admin-modal-header">
                <div>
                  <h3 className="admin-modal-title">Create New User Account</h3>
                  <p className="admin-modal-sub">Add a verified operator or administrator to MedVerify.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="admin-modal-close">
                  <X size={18} />
                </button>
              </div>

              {formError && (
                <div className="admin-modal-error">
                  <AlertTriangle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleCreateSubmit} className="admin-modal-form">
                <div className="admin-form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Sarah Jenkins"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                <div className="admin-form-group">
                  <label>Work Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. s.jenkins@hospital.org"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>

                <div className="admin-form-group">
                  <label>Initial Access Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Min 6 characters"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </div>

                <div className="admin-form-group">
                  <label>Account Role</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as 'user' | 'admin')}
                    className="admin-form-select"
                  >
                    <option value="user">Standard User (Verify & History)</option>
                    <option value="admin">System Administrator (Full Operational Control)</option>
                  </select>
                </div>

                <div className="admin-modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="admin-modal-btn cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="admin-modal-btn submit"
                  >
                    {formSubmitting ? 'Creating Account...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminUsers;
