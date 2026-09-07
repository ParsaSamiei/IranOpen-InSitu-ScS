import React from 'react';
import { formatRoundTime, ScoreNum } from '../formatScore.jsx';

export default function SuperTeamLeaderboardTable({ rows, loading }) {
  return (
    <div className="table-scroll">
      <table className="score-table">
        <thead>
          <tr>
            <th>رتبه</th>
            <th>سوپرتیم</th>
            <th>تیم‌های عضو</th>
            <th>امتیاز</th>
            <th>زمان</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((row, i) => (
            <tr key={row.super_team_id}>
              <td>{i + 1}</td>
              <td>{row.super_team_name || '—'}</td>
              <td>
                {(row.members || []).map((m) => (
                  <div key={m.team_id}>{m.team_name} <span className="muted">({m.league})</span></div>
                ))}
              </td>
              <td>
                {row.scores_hidden ? (
                  <span className="muted">مخفی</span>
                ) : row.played ? (
                  <strong><ScoreNum value={row.raw_score} /></strong>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                {row.scores_hidden || !row.played || row.round_time_seconds == null ? (
                  <span className="muted">—</span>
                ) : (
                  <span className="num-ltr" dir="ltr">{formatRoundTime(row.round_time_seconds)}</span>
                )}
              </td>
            </tr>
          ))}
          {(rows || []).length === 0 && !loading && (
            <tr><td colSpan={5} className="muted">سوپرتیمی ثبت نشده</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
