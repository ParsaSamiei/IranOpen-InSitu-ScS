import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { isLoggedIn, isSuperAdmin } from './api.js';

import PublicLayout from './layouts/PublicLayout.jsx';
import PublicLeaderboard from './public/PublicLeaderboard.jsx';
import PublicHistory from './public/PublicHistory.jsx';

import Login from './Login.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import ScoreEntryTab from './tabs/ScoreEntryTab.jsx';
import TeamsTab from './tabs/TeamsTab.jsx';
import HistoryTab from './tabs/HistoryTab.jsx';
import LeaderboardTab from './tabs/LeaderboardTab.jsx';
import ExportTab from './tabs/ExportTab.jsx';
import RulesTab from './tabs/RulesTab.jsx';
import UsersTab from './tabs/UsersTab.jsx';
import SettingsTab from './tabs/SettingsTab.jsx';

// Redirects to /admin/login (and back again on success) when the session
// expires mid-use — api.js dispatches this on any 401 response.
function AuthWatcher() {
  const navigate = useNavigate();
  useEffect(() => {
    const onLogout = () => navigate('/admin/login', { replace: true });
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [navigate]);
  return null;
}

function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/admin/login" replace />;
  return children;
}

function RequireSuperAdmin({ children }) {
  if (!isLoggedIn()) return <Navigate to="/admin/login" replace />;
  if (!isSuperAdmin()) return <Navigate to="/admin/entry" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthWatcher />
      <Routes>
        {/* ---------- Public read-only site ---------- */}
        <Route path="/" element={<PublicLayout />}>
          <Route index element={<Navigate to="/leaderboard" replace />} />
          <Route path="leaderboard" element={<PublicLeaderboard />} />
          <Route path="history" element={<PublicHistory />} />
        </Route>

        {/* ---------- Admin login ---------- */}
        <Route path="/admin/login" element={isLoggedIn() ? <Navigate to="/admin/entry" replace /> : <Login />} />

        {/* ---------- Admin panel (any logged-in role, some tabs Super-Admin-only) ---------- */}
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<Navigate to="/admin/entry" replace />} />
          <Route path="entry" element={<ScoreEntryTab />} />
          <Route path="teams" element={<TeamsTab />} />
          <Route path="history" element={<HistoryTab />} />
          <Route path="leaderboard" element={<LeaderboardTab />} />
          <Route path="export" element={<ExportTab />} />
          <Route path="rules" element={<RequireSuperAdmin><RulesTab /></RequireSuperAdmin>} />
          <Route path="users" element={<RequireSuperAdmin><UsersTab /></RequireSuperAdmin>} />
          <Route path="settings" element={<RequireSuperAdmin><SettingsTab /></RequireSuperAdmin>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
