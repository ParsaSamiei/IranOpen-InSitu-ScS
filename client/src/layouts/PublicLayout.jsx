import React, { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api.js";
import { useAsync } from "../hooks/useAsync.js";
import logo from "../assets/horse-logo.png";

export default function PublicLayout() {
  const [{ data: settings }] = useAsync(() => api.getPublicSettings(), []);

  useEffect(() => {
    if (settings?.competition_name) document.title = settings.competition_name;
  }, [settings]);

  return (
    <div className="app public-page">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <div className="app-logo-wrap">
              <img
                src={settings?.logo_url || logo}
                alt=""
                className="app-logo"
              />
            </div>
            <div className="app-header-text">
              <h1>{settings?.competition_name || "سامانه داوری"}</h1>
              {settings?.subtitle && (
                <p className="subtitle">{settings.subtitle}</p>
              )}
            </div>
          </div>
          <NavLink to="/admin/login" className="logout-btn public-nav-link">
            ورود مسئولین
          </NavLink>
        </div>
      </header>
      <nav className="tabs" aria-label="ناوبری اصلی">
        <div className="tabs-inner">
          <NavLink
            to="/leaderboard"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            رده‌بندی
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            سوابق
          </NavLink>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
