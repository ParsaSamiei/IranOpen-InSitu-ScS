import React from 'react';
import { formatRoundTime, ScoreNum } from '../formatScore.jsx';

// Renders the standings for a league: one column per round (normalized score
// as the headline number, raw score + round time underneath) plus a total
// column that sums every round's normalized score. Rows arrive already
// sorted (by total, then tie-break time, then name) from the API.
export default function LeaderboardTable({ rows, loading }) {
  const rounds = rows?.[0]?.rounds || [];
  const colCount = rounds.length + 4; // رتبه، تیم، مجموع، تعداد راندها

  return (
    <div className="table-scroll">
      <table className="score-table">
        <thead>
          <tr>
            <th>رتبه</th>
            <th>تیم</th>
            {rounds.map((r) => (
              <th key={r.round_id}>{r.round_label || `راند ${r.round_number}`}</th>
            ))}
            <th>مجموع امتیاز نرمال‌شده</th>
            <th>راندهای انجام‌شده</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((row, i) => (
            <tr key={row.team_id}>
              <td>{i + 1}</td>
              <td>{row.team_name}</td>
              {row.rounds.map((rd) => (
                <td key={rd.round_id}>
                  {rd.played ? (
                    <>
                      <strong><ScoreNum value={rd.normalized_score} /></strong>
                      <div className="leaderboard-round-sub muted">
                        <ScoreNum value={rd.raw_score} />
                        {rd.round_time_seconds != null && (
                          <>
                            {' · '}
                            <span className="num-ltr" dir="ltr">{formatRoundTime(rd.round_time_seconds)}</span>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              ))}
              <td><strong><ScoreNum value={row.total_normalized} /></strong></td>
              <td>{row.rounds_played} از {row.total_rounds}</td>
            </tr>
          ))}
          {(rows || []).length === 0 && !loading && (
            <tr><td colSpan={colCount} className="muted">تیمی ثبت نشده</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
