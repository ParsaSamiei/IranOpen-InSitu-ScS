import React from 'react';
import { api } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import SuperTeamLeaderboardTable from '../components/SuperTeamLeaderboardTable.jsx';

export default function PublicSuperTeamLeaderboard() {
  const [{ data: rows, loading, error }] = useAsync(() => api.getPublicSuperTeamLeaderboard(), []);

  return (
    <div className="tab-content">
      <h2>رده‌بندی سوپرتیم</h2>
      <p className="muted">
        هر سوپرتیم یک برگه امتیاز مشترک دارد؛ رتبه‌بندی بر اساس همان امتیاز (و در صورت تساوی، زمان کمتر) است.
      </p>

      {loading && <p>در حال بارگذاری...</p>}
      {error && <p className="error">{error}</p>}

      <SuperTeamLeaderboardTable rows={rows} loading={loading} />
    </div>
  );
}
