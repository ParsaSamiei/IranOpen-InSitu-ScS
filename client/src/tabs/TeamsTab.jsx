import React, { useState } from 'react';
import { api, isSuperAdmin } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { LEAGUES } from '../constants.js';

export default function TeamsTab() {
  const [league, setLeague] = useState(LEAGUES[0]);
  const [name, setName] = useState('');
  const [{ data: teams, loading, error }, reload] = useAsync(() => api.getTeams(), []);
  const superAdmin = isSuperAdmin();

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.addTeam(name.trim(), league);
    setName('');
    reload();
  };

  const remove = async (id) => {
    if (!confirm('حذف این تیم و تمام امتیازات آن؟')) return;
    await api.deleteTeam(id);
    reload();
  };

  return (
    <div className="tab-content">
      <h2>مدیریت تیم‌ها</h2>

      {superAdmin && (
        <form onSubmit={add} className="inline-form">
          <input placeholder="نام تیم" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={league} onChange={(e) => setLeague(e.target.value)}>
            {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button type="submit">افزودن تیم</button>
        </form>
      )}

      {loading && <p>در حال بارگذاری...</p>}
      {error && <p className="error">{error}</p>}

      {LEAGUES.map((l) => (
        <div key={l} className="team-league-block">
          <h3>{l}</h3>
          <ul className="team-list">
            {(teams || []).filter((t) => t.league === l).map((t) => (
              <li key={t.id}>
                {t.name}
                {superAdmin && <button className="link-danger" onClick={() => remove(t.id)}>حذف</button>}
              </li>
            ))}
            {(teams || []).filter((t) => t.league === l).length === 0 && <li className="muted">تیمی ثبت نشده</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}
