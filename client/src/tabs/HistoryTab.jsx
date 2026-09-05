import React, { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatRoundTime, ScoreNum } from '../formatScore.jsx';
import ScoreRecordModal from '../components/ScoreRecordModal.jsx';
import { LEAGUES } from '../constants.js';

export default function HistoryTab() {
  const [league, setLeague] = useState(LEAGUES[0]);
  const [{ data: scores, loading }, reload] = useAsync(() => api.getScores({ league }), [league]);
  const [modal, setModal] = useState(null); // { mode: 'view' | 'edit', record }

  const showTryCol = (scores || []).some((s) => s.allows_multiple_tries);

  const remove = async (id) => {
    if (!confirm('حذف این رکورد امتیاز؟')) return;
    await api.deleteScore(id);
    reload();
  };

  return (
    <div className="tab-content">
      <h2>سوابق امتیازات</h2>
      <select value={league} onChange={(e) => setLeague(e.target.value)}>
        {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>

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
            <th>داور</th>
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
              <td>{s.judge_name || '-'}</td>
              <td className="row-actions">
                <button className="link" onClick={() => setModal({ mode: 'view', record: s })}>نمایش</button>
                <button className="link" onClick={() => setModal({ mode: 'edit', record: s })}>ویرایش</button>
                <button className="link-danger" onClick={() => remove(s.id)}>حذف</button>
              </td>
            </tr>
          ))}
          {(scores || []).length === 0 && !loading && (
            <tr><td colSpan={showTryCol ? 7 : 6} className="muted">رکوردی ثبت نشده</td></tr>
          )}
        </tbody>
      </table>
      </div>

      {modal && (
        <ScoreRecordModal
          mode={modal.mode}
          record={modal.record}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }}
        />
      )}
    </div>
  );
}
