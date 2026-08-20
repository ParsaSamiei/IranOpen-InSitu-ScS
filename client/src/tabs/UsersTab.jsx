import React, { useState } from 'react';
import { api, getUser } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';

const ROLES = [
  { value: 'admin', label: 'داور / مسئول ثبت' },
  { value: 'super_admin', label: 'مدیر کل' },
];

function UserForm({ onSubmit, onCancel }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [display_name, setDisplayName] = useState('');
  const [role, setRole] = useState('admin');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit({ username: username.trim(), password, display_name: display_name.trim(), role });
      setUsername(''); setPassword(''); setDisplayName(''); setRole('admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card">
      <div className="form-grid">
        <label>
          <span>نام کاربری</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          <span>رمز عبور</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </label>
        <label>
          <span>نام نمایشی (اختیاری)</span>
          <input value={display_name} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          <span>نقش</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="btn-row">
        <button type="submit" className="primary" disabled={saving}>{saving ? 'در حال ذخیره...' : 'افزودن کاربر'}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={saving}>انصراف</button>}
      </div>
    </form>
  );
}

function EditUserRow({ user, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [display_name, setDisplayName] = useState(user.display_name || '');
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const me = getUser();

  if (!editing) {
    return (
      <tr>
        <td>{user.username}</td>
        <td>{user.display_name || '—'}</td>
        <td><span className={'role-tag' + (user.role === 'super_admin' ? ' role-tag--super' : '')}>{ROLES.find((r) => r.value === user.role)?.label}</span></td>
        <td className="row-actions">
          <button className="link" onClick={() => setEditing(true)}>ویرایش</button>
          {me?.id !== user.id && (
            <button
              className="link-danger"
              onClick={async () => {
                if (!confirm(`حذف کاربر «${user.username}»؟`)) return;
                try { await api.deleteUser(user.id); onSaved(); } catch (err) { alert(err.message); }
              }}
            >
              حذف
            </button>
          )}
        </td>
      </tr>
    );
  }

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateUser(user.id, { display_name, role, password: password || undefined });
      setEditing(false);
      setPassword('');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td>{user.username}</td>
      <td><input value={display_name} onChange={(e) => setDisplayName(e.target.value)} /></td>
      <td>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </td>
      <td className="row-actions user-edit-actions">
        <input type="password" placeholder="رمز جدید (اختیاری)" value={password} onChange={(e) => setPassword(e.target.value)} className="user-edit-password" />
        <button className="link" disabled={saving} onClick={save}>ذخیره</button>
        <button className="link" disabled={saving} onClick={() => setEditing(false)}>انصراف</button>
        {error && <span className="error">{error}</span>}
      </td>
    </tr>
  );
}

export default function UsersTab() {
  const [{ data: users, loading, error }, reload] = useAsync(() => api.getUsers(), []);
  const [adding, setAdding] = useState(false);

  return (
    <div className="tab-content">
      <h2>مدیریت کاربران</h2>

      {loading && <p>در حال بارگذاری...</p>}
      {error && <p className="error">{error}</p>}

      <div className="table-scroll">
      <table className="score-table user-table">
        <thead>
          <tr><th>نام کاربری</th><th>نام نمایشی</th><th>نقش</th><th></th></tr>
        </thead>
        <tbody>
          {(users || []).map((u) => <EditUserRow key={u.id} user={u} onSaved={reload} />)}
          {(users || []).length === 0 && !loading && <tr><td colSpan={4} className="muted">کاربری ثبت نشده</td></tr>}
        </tbody>
      </table>
      </div>

      {adding ? (
        <UserForm onCancel={() => setAdding(false)} onSubmit={async (payload) => { await api.createUser(payload); setAdding(false); reload(); }} />
      ) : (
        <button type="button" onClick={() => setAdding(true)}>+ افزودن کاربر</button>
      )}
    </div>
  );
}
