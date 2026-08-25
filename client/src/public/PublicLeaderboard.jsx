import React, { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import { LEAGUES } from '../constants.js';
import LeaderboardTable from '../components/LeaderboardTable.jsx';

export default function PublicLeaderboard() {
  const [league, setLeague] = useState(LEAGUES[0]);
  const [{ data: rows, loading, error }] = useAsync(() => api.getPublicLeaderboard(league), [league]);

  return (
    <div className="tab-content">
      <h2>جدول رده‌بندی (مجموع امتیاز نرمال‌شده‌ی همه‌ی راندها)</h2>
      <p className="muted">
        امتیاز هر راند نسبت به بهترین امتیاز همان راند نرمال می‌شود (بهترین تیم = ۱۰۰) و رتبه‌بندی بر اساس مجموع این امتیازهای نرمال‌شده در همه‌ی راندهاست؛ امتیاز خام و زمان هر راند هم زیر امتیاز نرمال همان راند نمایش داده می‌شود.
      </p>
      <select value={league} onChange={(e) => setLeague(e.target.value)}>
        {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>

      {loading && <p>در حال بارگذاری...</p>}
      {error && <p className="error">{error}</p>}

      <LeaderboardTable rows={rows} loading={loading} />
    </div>
  );
}
