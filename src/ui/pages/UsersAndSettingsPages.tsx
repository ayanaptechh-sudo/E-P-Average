/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../services/authContext';
import { userRepo, auditRepo } from '../../database/repositories/userRepo';
import { settingsRepo } from '../../database/repositories/reportRepo';
import { AppUser, UserRole, UserStatus, AuditLog } from '../../database/types';
import { DataTable, Column, Modal } from '../components/DataTable';
import { generateSalt, hashPassword } from '../../security/crypto';
import { exportDatabase, importDatabase } from '../../database/db';
import { retentionService, RetentionRunResult } from '../../core/retentionService';

export const UsersPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>(() => userRepo.getAll());
  const [refreshKey, setRefreshKey] = useState(0);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetPwdModalOpen, setIsResetPwdModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('End User');
  const [department, setDepartment] = useState('Engineering');
  const [status, setStatus] = useState<UserStatus>('Active');
  const [formError, setFormError] = useState<string | null>(null);

  const reload = () => {
    setUsers(userRepo.getAll());
    setRefreshKey(k => k + 1);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!username.trim() || password.length < 8) {
      setFormError('Username is required and password must be at least 8 characters.');
      return;
    }

    try {
      const salt = generateSalt();
      const password_hash = await hashPassword(password, salt);
      const created = await userRepo.create({
        username: username.trim(),
        password_hash,
        salt,
        role,
        department,
        status,
      });

      await auditRepo.log({
        user_id: currentUser?.user_id || 'system',
        action: 'USER_CREATED',
        target_type: 'user',
        target_id: created.user_id,
        outcome: 'Success',
        details: `Created user account "${created.username}" with role [${created.role}] in department [${created.department}].`,
      });

      setIsCreateModalOpen(false);
      setUsername('');
      setPassword('');
      reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !currentUser) return;

    await userRepo.updateRoleAndStatus(selectedUser.user_id, role, status, department);
    await auditRepo.log({
      user_id: currentUser.user_id,
      action: 'USER_UPDATED',
      target_type: 'user',
      target_id: selectedUser.user_id,
      outcome: 'Success',
      details: `Updated user "${selectedUser.username}": role=${role}, status=${status}, dept=${department}.`,
    });

    setIsEditModalOpen(false);
    setSelectedUser(null);
    reload();
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !currentUser || password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    const salt = generateSalt();
    const password_hash = await hashPassword(password, salt);
    await userRepo.resetPassword(selectedUser.user_id, password_hash, salt);

    await auditRepo.log({
      user_id: currentUser.user_id,
      action: 'USER_PASSWORD_RESET',
      target_type: 'user',
      target_id: selectedUser.user_id,
      outcome: 'Success',
      details: `Password reset performed for user account "${selectedUser.username}".`,
    });

    setIsResetPwdModalOpen(false);
    setSelectedUser(null);
    setPassword('');
    reload();
  };

  const columns: Column<AppUser>[] = [
    {
      header: 'Username',
      accessor: (u) => (
        <div>
          <span className="font-bold text-gray-900 dark:text-slate-100 text-xs">{u.username}</span>
          <div className="font-mono text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{u.user_id.slice(0, 8)}</div>
        </div>
      ),
      sortable: true,
      sortValue: (u) => u.username,
    },
    {
      header: 'Role',
      accessor: (u) => (
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
            u.role === 'Administrator'
              ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/80'
              : u.role === 'Analyst'
              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80'
              : u.role === 'Manager'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/80'
              : u.role === 'Auditor'
              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/80'
              : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700'
          }`}
        >
          {u.role}
        </span>
      ),
      sortable: true,
      sortValue: (u) => u.role,
    },
    {
      header: 'Department',
      accessor: (u) => <span className="text-gray-800 dark:text-slate-200 font-medium text-xs">{u.department}</span>,
      sortable: true,
    },
    {
      header: 'Status',
      accessor: (u) => (
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
            u.status === 'Active'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80'
              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/80'
          }`}
        >
          {u.status}
        </span>
      ),
      sortable: true,
      sortValue: (u) => u.status,
    },
    {
      header: 'Created (UTC)',
      accessor: (u) => (
        <span className="font-mono text-[11px] text-gray-500 dark:text-slate-400">
          {new Date(u.created_at).toLocaleDateString()}
        </span>
      ),
      sortable: true,
      sortValue: (u) => u.created_at,
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (u) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setSelectedUser(u);
              setRole(u.role);
              setDepartment(u.department);
              setStatus(u.status);
              setIsEditModalOpen(true);
            }}
            className="px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors cursor-pointer"
          >
            Edit
          </button>
          <button
            onClick={() => {
              setSelectedUser(u);
              setPassword('');
              setFormError(null);
              setIsResetPwdModalOpen(true);
            }}
            className="px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors cursor-pointer border border-indigo-200/60 dark:border-indigo-800/80"
          >
            Reset Pwd
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
            User Accounts & Role Permissions
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
            Enterprise RBAC access control: Administrator, Security Analyst, Compliance Auditor, Manager, End User
          </p>
        </div>

        <button
          onClick={() => {
            setUsername('');
            setPassword('');
            setFormError(null);
            setIsCreateModalOpen(true);
          }}
          className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors flex items-center gap-1.5 self-start cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Create User</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        keyField="user_id"
        searchPlaceholder="Filter users by username, department, role..."
        searchFilter={(u, q) =>
          u.username.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
        }
      />

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New User Account"
        subtitle="Password will be salted and hashed locally with Web Crypto PBKDF2 (SHA-256)."
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          {formError && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold text-rose-800 dark:text-rose-300">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. jdoe_sec"
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Initial Password (Min 8 chars)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
              >
                <option value="Administrator">Administrator</option>
                <option value="Analyst">Analyst</option>
                <option value="Auditor">Auditor</option>
                <option value="Manager">Manager</option>
                <option value="End User">End User</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Department
            </label>
            <input
              type="text"
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Engineering, SecOps, HR, Finance"
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-gray-150 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Create User
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedUser(null);
        }}
        title={`Edit User: ${selectedUser?.username}`}
        subtitle="Modify user access tier, departmental assignment, or account active status."
      >
        <form onSubmit={handleUpdateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
            >
              <option value="Administrator">Administrator</option>
              <option value="Analyst">Analyst</option>
              <option value="Auditor">Auditor</option>
              <option value="Manager">Manager</option>
              <option value="End User">End User</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Department
            </label>
            <input
              type="text"
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Account Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as UserStatus)}
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
            >
              <option value="Active">Active</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-gray-150 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setIsEditModalOpen(false);
                setSelectedUser(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetPwdModalOpen}
        onClose={() => {
          setIsResetPwdModalOpen(false);
          setSelectedUser(null);
        }}
        title={`Reset Password for ${selectedUser?.username}`}
        subtitle="Sets a new password using PBKDF2 key derivation with 100,000 iterations."
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          {formError && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold text-rose-800 dark:text-rose-300">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              New Password (Min 8 characters)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-gray-150 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setIsResetPwdModalOpen(false);
                setSelectedUser(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Update Password
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [customIdRegex, setCustomIdRegex] = useState('');
  const [orgName, setOrgName] = useState('Enterprise Corp');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => auditRepo.getAll(150));
  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<RetentionRunResult | null>(null);

  const isAdmin = currentUser?.role === 'Administrator';

  // Load from local settings repo
  useMemo(() => {
    const to = settingsRepo.get('session_timeout', '30');
    const rx = settingsRepo.get('custom_id_regex', '');
    const org = settingsRepo.get('org_name', 'PromptShield Enterprise');
    setSessionTimeout(to);
    setCustomIdRegex(rx);
    setOrgName(org);
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isAdmin) return;

    await settingsRepo.set('session_timeout', sessionTimeout);
    await settingsRepo.set('custom_id_regex', customIdRegex);
    await settingsRepo.set('org_name', orgName);

    await auditRepo.log({
      user_id: currentUser.user_id,
      action: 'SYSTEM_SETTINGS_UPDATED',
      target_type: 'settings',
      target_id: 'system',
      outcome: 'Success',
      details: `Updated timeout=${sessionTimeout}min, org="${orgName}", custom_regex=${customIdRegex ? 'set' : 'none'}.`,
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    setAuditLogs(auditRepo.getAll(150));
  };

  const handleExportDb = () => {
    try {
      const bytes = exportDatabase();
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PromptShield-backup-${new Date().toISOString().slice(0, 10)}.db`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export DB:', err);
    }
  };

  const handleImportDb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Warning: Restoring a database file will overwrite all current local findings, users, and audit records. Continue?')) {
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      await importDatabase(uint8);
      alert('Database restored successfully! Application will reload.');
      window.location.reload();
    } catch (err) {
      alert(`Database import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRunRetention = async () => {
    if (!currentUser || !isAdmin) return;
    if (!confirm('Run data retention purge according to configured policy schedules? Stale records will be deleted permanently.')) {
      return;
    }

    setIsPurging(true);
    try {
      const res = await retentionService.runRetention(currentUser.user_id);
      setPurgeResult(res);
      setAuditLogs(auditRepo.getAll(150));
    } finally {
      setIsPurging(false);
    }
  };

  const auditColumns: Column<AuditLog>[] = [
    {
      header: 'Action',
      accessor: (l) => <span className="font-mono font-bold text-gray-900 dark:text-slate-100 text-xs">{l.action}</span>,
      sortable: true,
      sortValue: (l) => l.action,
    },
    {
      header: 'User ID',
      accessor: (l) => <span className="font-mono text-xs text-gray-600 dark:text-slate-400">{l.user_id.slice(0, 12)}</span>,
    },
    {
      header: 'Target',
      accessor: (l) => <span className="text-gray-700 dark:text-slate-300 font-medium text-xs">{l.target_type}: {l.target_id}</span>,
    },
    {
      header: 'Outcome',
      accessor: (l) => (
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
            l.outcome === 'Success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80'
              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/80'
          }`}
        >
          {l.outcome}
        </span>
      ),
      sortable: true,
      sortValue: (l) => l.outcome,
    },
    {
      header: 'Details',
      accessor: (l) => <span className="text-gray-600 dark:text-slate-400 text-xs line-clamp-1">{l.details}</span>,
    },
    {
      header: 'Logged At (UTC)',
      accessor: (l) => (
        <span className="font-mono text-[11px] text-gray-500 dark:text-slate-400">
          {new Date(l.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
        </span>
      ),
      sortable: true,
      sortValue: (l) => l.timestamp,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
          Settings, Database Backup & Audit Logs
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
          Local SQLite lifecycle maintenance, database binary snapshotting, and system audit log ledger
        </p>
      </div>

      {saveSuccess && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          Settings saved successfully!
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Core System Configuration */}
        {isAdmin && (
          <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 shadow-xs">
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-1">
              Guardrail Parameters
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4 font-medium">
              Local timeout intervals and custom National ID regex filters.
            </p>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1">
                  Session Inactivity Timeout (Minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 font-mono focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1">
                  Custom National ID / SSN Regular Expression
                </label>
                <input
                  type="text"
                  value={customIdRegex}
                  onChange={(e) => setCustomIdRegex(e.target.value)}
                  placeholder="e.g. \\b[0-9]{3}-[0-9]{2}-[0-9]{4}\\b"
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 font-mono focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1">
                  Organization Entity Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Database Backup & Retention Purge */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-1">
              Database Backup & Local Persistence
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4 font-medium">
              Export the complete SQLite database file (.db) to store offsite, or restore from an existing backup snapshot.
            </p>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleExportDb}
                  className="px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 text-gray-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Export Database (.db)</span>
                </button>

                {isAdmin && (
                  <label className="px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                    <svg className="w-4 h-4 text-gray-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>Import & Restore (.db)</span>
                    <input
                      type="file"
                      accept=".db,.sqlite,.sqlite3"
                      onChange={handleImportDb}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Retention Purge Section */}
              {isAdmin && (
                <div className="mt-6 pt-4 border-t border-gray-150 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-slate-100">
                      On-Demand Data Retention Purge
                    </h4>
                    <button
                      onClick={handleRunRetention}
                      disabled={isPurging}
                      className="px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isPurging ? 'Purging...' : 'Run Retention Purge Now'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">
                    Applies the configured policy retention schedule to prune stale events, scans, and audit logs.
                  </p>

                  {purgeResult && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-900 rounded-xl text-xs font-mono text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-700">
                      Purged: {purgeResult.purgedEvents} events, {purgeResult.purgedScansAndFindings} scans/findings, {purgeResult.purgedAlerts} alerts, {purgeResult.purgedAuditLogs} audit records.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-4 font-medium">
            Zero cloud transmission. All records stored strictly in local browser IndexedDB / WASM file storage.
          </div>
        </div>
      </div>

      {/* System Audit Logs Ledger */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-200/80 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              System Audit Trail ({auditLogs.length} entries)
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 font-medium">
              Immutable security event logging: logins, policy modifications, approval toggles, report generations
            </p>
          </div>
        </div>

        <DataTable
          columns={auditColumns}
          data={auditLogs}
          keyField="audit_log_id"
          searchPlaceholder="Filter audit events by action, user, details..."
          searchFilter={(l, q) =>
            l.action.toLowerCase().includes(q) ||
            l.user_id.toLowerCase().includes(q) ||
            l.details.toLowerCase().includes(q)
          }
          emptyTitle="No audit logs recorded"
          emptySubtitle="System actions will be recorded here automatically."
        />
      </div>
    </div>
  );
};
