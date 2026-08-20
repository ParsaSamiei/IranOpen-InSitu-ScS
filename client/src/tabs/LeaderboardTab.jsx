import React, { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatRoundTime, ScoreNum } from '../formatScore.jsx';
import { LEAGUES } from '../constants.js';

export default function LeaderboardTab() {
  const [league, setLeague] = useState(LEAGUES[0]);
  const [{ data: rows, loading, error }] = useAsync(() => api.getLeaderboard(league), [league]);

  return (
    <div className="tab-content">
      <h2>جدول رده‌بندی (بهترین راند هر تیم)</h2>
      <select value={league} onChange={(e) => setLeague(e.target.value)}>
        {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>

      {loading && <p>در حال بارگذاری...</p>}
      {error && <p className="error">{error}</p>}

      <div className="table-scroll">
      <table className="score-table">
        <thead>
          <tr><th>رتبه</th><th>تیم</th><th>بهترین امتیاز</th><th>زمان بهترین راند</th><th>تعداد راندها</th></tr>
        </thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={r.team_id}>
              <td>{i + 1}</td>
              <td>{r.team_name}</td>
              <td><strong><ScoreNum value={r.best_score} /></strong></td>
              <td><span className="num-ltr" dir="ltr">{formatRoundTime(r.best_time_seconds)}</span></td>
              <td>{r.rounds_played}</td>
            </tr>
          ))}
          {(rows || []).length === 0 && !loading && (
            <tr><td colSpan={5} className="muted">تیمی ثبت نشده</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
