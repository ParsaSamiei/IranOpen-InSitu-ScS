import React, { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatRoundTime, ScoreNum } from '../formatScore.jsx';
import ScoreRecordModal from '../components/ScoreRecordModal.jsx';
import { LEAGUES } from '../constants.js';

export default function PublicHistory() {
  const [league, setLeague] = useState(LEAGUES[0]);
  const [teamId, setTeamId] = useState('');
  const [{ data: teams }] = useAsync(() => api.getPublicTeams(league), [league]);
  const [{ data: scores, loading }] = useAsync(
    () => api.getPublicHistory({ league, team_id: teamId || undefined }),
    [league, teamId]
  );
  const [record, setRecord] = useState(null);
  const showTryCol = (scores || []).some((s) => s.allows_multiple_tries);

  return (
    <div className="tab-content">
      <h2>سوابق امتیازات</h2>
      <div className="team-filter-row">
        <select value={league} onChange={(e) => { setLeague(e.target.value); setTeamId(''); }}>
          {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">همه تیم‌ها</option>
          {(teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {loading && <p>در حال بارگذاری...</p>}

      <div className="table-scroll">
      <table className="score-table">
        <thead>
          <tr>
            <th>تیم</th>
            <th>راند</th>
            {showTryCol && <th>تلاش</th>}
            <th>زمان</th>
            <th>امتیاز نهایی</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(scores || []).map((s) => (
            <tr key={s.id}>
              <td>{s.team_name}</td>
              <td>{s.round_label || s.round_number}</td>
              {showTryCol && (
                <td>{s.allows_multiple_tries ? (s.try_number ?? '—') : '—'}</td>
              )}
              <td><span className="num-ltr" dir="ltr">{formatRoundTime(s.round_time_seconds)}</span></td>
              <td><strong><ScoreNum value={s.final_total} /></strong></td>
              <td className="row-actions">
                <button className="link" onClick={() => setRecord(s)}>نمایش جزئیات</button>
              </td>
            </tr>
          ))}
          {(scores || []).length === 0 && !loading && (
            <tr><td colSpan={showTryCol ? 6 : 5} className="muted">رکوردی ثبت نشده</td></tr>
          )}
        </tbody>
      </table>
      </div>

      {record && (
        <ScoreRecordModal mode="view" record={record} publicMode onClose={() => setRecord(null)} />
      )}
    </div>
  );
}
