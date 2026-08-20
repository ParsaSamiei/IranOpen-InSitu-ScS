// In production (Vercel), the client and API are served from the same
// deployment, so a relative '/api' path just works. For local development,
// set VITE_API_URL=http://localhost:4000/api in client/.env
const BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "IranOpen-InSitu_auth_token";
const USER_KEY = "IranOpen-InSitu_auth_user";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

function setSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

export function isSuperAdmin() {
  return getUser()?.role === "super_admin";
}

async function req(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("auth:logout"));
    const err = await res.json().catch(() => ({ error: "ورود لازم است" }));
    throw new Error(err.error || "ورود لازم است");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "خطای ناشناخته" }));
    throw new Error(err.error || "خطا در ارتباط با سرور");
  }

  return res.json();
}

function qs(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "",
    ),
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : "";
}

export const api = {
  // ---------- Auth ----------
  login: async (username, password) => {
    const res = await fetch(BASE + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "ورود ناموفق بود");
    setSession(data.token, data.user);
    return data;
  },
  logout: () => clearSession(),

  // ---------- Public (unauthenticated) read-only site ----------
  getPublicSettings: () => req("/public/settings"),
  getPublicTeams: (league) => req("/public/teams" + qs({ league })),
  getPublicLeaderboard: (league) => req("/public/leaderboard" + qs({ league })),
  getPublicHistory: (params = {}) => req("/public/history" + qs(params)),
  getPublicRoundRules: (id) => req(`/public/rounds/${id}/sections`),

  // ---------- Teams ----------
  getTeams: (league) => req("/teams" + qs({ league })),
  addTeam: (name, league) =>
    req("/teams", { method: "POST", body: JSON.stringify({ name, league }) }),
  deleteTeam: (id) => req(`/teams/${id}`, { method: "DELETE" }),

  // ---------- Rounds & rule builder ----------
  getRounds: (league) => req("/rounds" + qs({ league })),
  getRound: (id) => req(`/rounds/${id}`),
  getRoundRules: (id) => req(`/rounds/${id}/sections`), // { round, sections: [{...,items}] }
  createRound: (payload) =>
    req("/rounds", { method: "POST", body: JSON.stringify(payload) }),
  updateRound: (id, payload) =>
    req(`/rounds/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteRound: (id) => req(`/rounds/${id}`, { method: "DELETE" }),

  createSection: (roundId, payload) =>
    req(`/rounds/${roundId}/sections`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSection: (id, payload) =>
    req(`/sections/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteSection: (id) => req(`/sections/${id}`, { method: "DELETE" }),

  createItem: (sectionId, payload) =>
    req(`/sections/${sectionId}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateItem: (id, payload) =>
    req(`/items/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteItem: (id) => req(`/items/${id}`, { method: "DELETE" }),

  // ---------- Scores ----------
  getScores: (params = {}) => req("/scores" + qs(params)),
  addScore: (payload) =>
    req("/scores", { method: "POST", body: JSON.stringify(payload) }),
  updateScore: (id, payload) =>
    req(`/scores/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteScore: (id) => req(`/scores/${id}`, { method: "DELETE" }),
  getLeaderboard: (league) => req("/leaderboard" + qs({ league })),

  // ---------- Users (Super Admin only) ----------
  getUsers: () => req("/users"),
  createUser: (payload) =>
    req("/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) =>
    req(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteUser: (id) => req(`/users/${id}`, { method: "DELETE" }),

  // ---------- Settings (Super Admin only) ----------
  getSettings: () => req("/settings"),
  updateSettings: (payload) =>
    req("/settings", { method: "PUT", body: JSON.stringify(payload) }),

  // ---------- Export ----------
  exportScores: async (league) => {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(BASE + "/export" + qs({ league }), { headers });
    if (res.status === 401) {
      clearSession();
      window.dispatchEvent(new Event("auth:logout"));
      throw new Error("ورود لازم است");
    }
    if (!res.ok) throw new Error("خطا در دانلود فایل");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = league
      ? `IranOpen-InSitu-${league}-scores.xlsx`
      : "IranOpen-InSitu-all-leagues-scores.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  },
};
