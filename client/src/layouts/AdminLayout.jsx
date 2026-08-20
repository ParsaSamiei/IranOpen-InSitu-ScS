import React, { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, getUser, isSuperAdmin } from '../api.js';
import { useAsync } from '../hooks/useAsync.js';
import logo from '../assets/Pishnam_logo.png';

const TABS = [
  { to: '/admin/entry', label: 'ثبت امتیاز' },
  { to: '/admin/teams', label: 'تیم‌ها' },
  { to: '/admin/history', label: 'سوابق' },
  { to: '/admin/leaderboard', label: 'رده‌بندی' },
  { to: '/admin/export', label: 'خروجی اکسل' },
  { to: '/admin/rules', label: 'قوانین امتیازدهی', superOnly: true },
  { to: '/admin/users', label: 'کاربران', superOnly: true },
  { to: '/admin/settings', label: 'تنظیمات', superOnly: true },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getUser();
  const superAdmin = isSuperAdmin();
  const [{ data: settings }] = useAsync(() => api.getPublicSettings(), []);

  useEffect(() => {
    if (settings?.competition_name) document.title = settings.competition_name;
  }, [settings]);

  const logout = () => {
    api.logout();
    navigate('/admin/login', { replace: true });
  };

  const tabs = TABS.filter((t) => !t.superOnly || superAdmin);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <div className="app-logo-wrap">
              <img src={settings?.logo_url || logo} alt="" className="app-logo" />
            </div>
            <div className="app-header-text">
              <h1>
                {settings?.competition_name || 'سامانه داوری'}
                <span className={'role-badge' + (superAdmin ? ' role-badge--super' : '')}>
                  {superAdmin ? 'مدیر کل' : 'داور / مسئول ثبت'}
                </span>
              </h1>
              {settings?.subtitle && <p className="subtitle">{settings.subtitle}</p>}
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={logout} aria-label="خروج از حساب">
            {user?.display_name ? `${user.display_name} — خروج` : 'خروج'}
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="ناوبری اصلی">
        <div className="tabs-inner">
          {tabs.map(({ to, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
