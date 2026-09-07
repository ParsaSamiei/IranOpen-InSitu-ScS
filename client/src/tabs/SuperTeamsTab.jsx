import React, { useMemo, useState } from 'react';
import { api, isSuperAdmin } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { LEAGUES, SUPERTEAM_MAX_MEMBERS, SUPERTEAM_MIN_MEMBERS } from '../constants.js';

function memberLabel(team) {
  return `${team.name} (${team.league})`;
}

export default function SuperTeamsTab() {
  const superAdmin = isSuperAdmin();
  const [{ data: teams, loading: teamsLoading }] = useAsync(() => api.getTeams(), []);
  const [{ data: superTeams, loading, error }, reload] = useAsync(() => api.getSuperTeams(), []);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const takenTeamIds = useMemo(() => {
    const taken = new Set();
    for (const st of superTeams || []) {
      if (editingId && st.id === editingId) continue;
      for (const m of st.members || []) taken.add(m.team_id);
    }
    return taken;
  }, [superTeams, editingId]);

  const availableTeams = useMemo(
    () => (teams || []).filter((t) => !takenTeamIds.has(t.id) || selectedIds.includes(t.id)),
    [teams, takenTeamIds, selectedIds]
  );

  const toggleTeam = (id) => {
    setMessage('');
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= SUPERTEAM_MAX_MEMBERS) {
        setMessage(`حداکثر ${SUPERTEAM_MAX_MEMBERS} تیم می‌توانند در یک سوپرتیم باشند`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const startEdit = (st) => {
    setEditingId(st.id);
    setSelectedIds((st.members || []).map((m) => m.team_id));
    setMessage('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setSelectedIds([]);
    setMessage('');
  };

  const save = async (e) => {
    e.preventDefault();
    if (selectedIds.length < SUPERTEAM_MIN_MEMBERS || selectedIds.length > SUPERTEAM_MAX_MEMBERS) {
      setMessage(`هر سوپرتیم باید ${SUPERTEAM_MIN_MEMBERS} یا ${SUPERTEAM_MAX_MEMBERS} تیم داشته باشد`);
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      if (editingId) await api.updateSuperTeam(editingId, selectedIds);
      else await api.createSuperTeam(selectedIds);
      cancelEdit();
      reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('حذف این سوپرتیم و تمام امتیازات آن؟')) return;
    try {
      await api.deleteSuperTeam(id);
      if (editingId === id) cancelEdit();
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="tab-content">
      <h2>مدیریت سوپرتیم‌ها</h2>
      <p className="muted">
        هر سوپرتیم از {SUPERTEAM_MIN_MEMBERS} یا {SUPERTEAM_MAX_MEMBERS} تیم (از هر لیگ) تشکیل می‌شود.
        امتیاز سوپرتیم روی یک برگه مشترک ثبت می‌شود و رده‌بندی جداگانه دارد.
      </p>

      {superAdmin && (
        <form onSubmit={save} className="card" style={{ marginBottom: 18 }}>
          <h3>{editingId ? 'ویرایش سوپرتیم' : 'افزودن سوپرتیم'}</h3>
          <p className="muted">
            انتخاب‌شده: {selectedIds.length} از {SUPERTEAM_MIN_MEMBERS}–{SUPERTEAM_MAX_MEMBERS}
            {selectedIds.length > 0 && teams && (
              <> — {[...selectedIds].map((id) => teams.find((t) => t.id === id)?.name).filter(Boolean).join(' + ')}</>
            )}
          </p>

          {LEAGUES.map((league) => (
            <div key={league} className="team-league-block">
              <h4>{league}</h4>
              <ul className="team-list">
                {availableTeams.filter((t) => t.league === league).map((t) => (
                  <li key={t.id}>
                    <label className="checkbox-field" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(t.id)}
                        onChange={() => toggleTeam(t.id)}
                      />
                      <span>{t.name}</span>
                    </label>
                  </li>
                ))}
                {availableTeams.filter((t) => t.league === league).length === 0 && (
                  <li className="muted">تیم آزاد برای انتخاب نیست</li>
                )}
              </ul>
            </div>
          ))}

          {message && <p className="error">{message}</p>}
          <div className="btn-row">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'در حال ذخیره...' : (editingId ? 'ذخیره تغییرات' : 'افزودن سوپرتیم')}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} disabled={saving}>انصراف</button>
            )}
          </div>
        </form>
      )}

      {(loading || teamsLoading) && <p>در حال بارگذاری...</p>}
      {error && <p className="error">{error}</p>}

      <ul className="team-list">
        {(superTeams || []).map((st) => (
          <li key={st.id}>
            <div>
              <strong>{st.name || '—'}</strong>
              <div className="muted" style={{ fontSize: '0.9em' }}>
                {(st.members || []).map(memberLabel).join(' · ')}
              </div>
            </div>
            {superAdmin && (
              <span className="btn-row">
                <button type="button" className="link" onClick={() => startEdit(st)}>ویرایش</button>
                <button type="button" className="link-danger" onClick={() => remove(st.id)}>حذف</button>
              </span>
            )}
          </li>
        ))}
        {(superTeams || []).length === 0 && !loading && (
          <li className="muted">سوپرتیمی ثبت نشده</li>
        )}
      </ul>
    </div>
  );
}
