import React, { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatRoundTime, ScoreNum } from '../formatScore.jsx';
import ScoreRecordModal from '../components/ScoreRecordModal.jsx';
import { LEAGUES, ROUND_LEAGUES, SUPERTEAM_LEAGUE } from '../constants.js';

export default function PublicHistory() {
  const [league, setLeague] = useState(LEAGUES[0]);
  const [participantId, setParticipantId] = useState('');
  const isSuperHistory = league === SUPERTEAM_LEAGUE;

  const [{ data: teams }] = useAsync(
    () => (isSuperHistory ? Promise.resolve([]) : api.getPublicTeams(league)),
    [league, isSuperHistory]
  );
  const [{ data: superTeams }] = useAsync(
    () => (isSuperHistory ? api.getPublicSuperTeams() : Promise.resolve([])),
    [isSuperHistory]
  );
  const [{ data: scores, loading }] = useAsync(
    () => api.getPublicHistory({
      league,
      ...(isSuperHistory
        ? { super_team_id: participantId || undefined }
        : { team_id: participantId || undefined }),
    }),
    [league, participantId, isSuperHistory]
  );
  const [record, setRecord] = useState(null);
  const showTryCol = (scores || []).some((s) => s.allows_multiple_tries);

  return (
    <div className="tab-content">
      <h2>سوابق امتیازات</h2>
      <div className="team-filter-row">
        <select value={league} onChange={(e) => { setLeague(e.target.value); setParticipantId(''); }}>
          {ROUND_LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={participantId} onChange={(e) => setParticipantId(e.target.value)}>
          <option value="">{isSuperHistory ? 'همه سوپرتیم‌ها' : 'همه تیم‌ها'}</option>
          {isSuperHistory
            ? (superTeams || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name || `سوپرتیم #${t.id}`}</option>
            ))
            : (teams || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
        </select>
      </div>

      {loading && <p>در حال بارگذاری...</p>}

      <div className="table-scroll">
      <table className="score-table">
        <thead>
          <tr>
            <th>{isSuperHistory ? 'سوپرتیم' : 'تیم'}</th>
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
                <td>{s.scores_hidden ? '—' : (s.allows_multiple_tries ? (s.try_number ?? '—') : '—')}</td>
              )}
              <td>
                {s.scores_hidden
                  ? <span className="muted">مخفی</span>
                  : <span className="num-ltr" dir="ltr">{formatRoundTime(s.round_time_seconds)}</span>}
              </td>
              <td>
                {s.scores_hidden
                  ? <span className="muted">مخفی</span>
                  : <strong><ScoreNum value={s.final_total} /></strong>}
              </td>
              <td className="row-actions">
                {!s.scores_hidden && (
                  <button className="link" onClick={() => setRecord(s)}>نمایش جزئیات</button>
                )}
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
