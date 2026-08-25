const path = require('path');

// Load root .env when running locally (`node api/index.js` / `npm start`).
// Vercel injects env vars itself, so skip there.
if (process.env.VERCEL !== '1') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const { createToken, validateCredentials, authMiddleware, getSecret } = require('./auth');
const { loginIpLimiter, loginUsernameLimiter, resetUsername } = require('./rateLimit');

const publicRoutes = require('./routes/publicRoutes');
const teamRoutes = require('./routes/teamRoutes');
const roundRoutes = require('./routes/roundRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const userRoutes = require('./routes/userRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const exportRoutes = require('./routes/exportRoutes');

const app = express();

// In production this runs behind nginx on the host (deploy/nginx-pishcup.conf
// proxies to 127.0.0.1:4000), so without this every request would look like it
// came from the proxy's address — and the per-IP login limiter would treat the
// entire venue as a single client. Trusting exactly ONE hop makes req.ip the
// last entry nginx appended to X-Forwarded-For, i.e. the address nginx really
// saw, so a client can't pick its own key by sending an X-Forwarded-For header
// of its own. Set TRUST_PROXY=0 if the app is ever exposed directly with no
// proxy in front, or to the number of proxies if you add more.
app.set('trust proxy', (() => {
  const raw = process.env.TRUST_PROXY;
  if (raw == null || raw === '') return 1;
  if (raw === 'false') return false;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    console.warn(`WARNING: TRUST_PROXY="${raw}" is not a non-negative integer — falling back to 1.`);
    return 1;
  }
  return hops;
})());

app.use(cors());
app.use(express.json({ limit: '5mb' })); // captain signatures are base64 PNG data URLs

if (!getSecret()) {
  console.warn('WARNING: AUTH_SECRET is not set — login will be disabled until you configure it.');
}

// Make sure tables exist (and the bootstrap Super Admin/default settings are
// seeded) before handling any request. initDb() caches its promise, so this
// is cheap after the first call.
app.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    console.error('DB init failed:', err);
    res.status(500).json({ error: 'خطا در اتصال به پایگاه داده' });
  }
});

// ---------- Public (unauthenticated) read-only site ----------
app.use('/api/public', publicRoutes);

// ---------- Auth ----------
// Rate limited twice over: per-IP first (cheap, stops a single host hammering
// the endpoint), then per-username (follows the targeted account even if the
// attacker rotates IPs). Both count failures only — see api/rateLimit.js.
app.post('/api/login', loginIpLimiter, loginUsernameLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!getSecret()) {
    return res.status(503).json({ error: 'احراز هویت پیکربندی نشده است' });
  }
  const user = await validateCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
  }
  // Correct password proves the earlier failures on this username weren't an
  // attack on it, so clear its counter instead of leaving a judge who mistyped
  // a few times one typo away from a lockout.
  resetUsername(username);
  res.json({ token: createToken(user), user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } });
});

// Everything else under /api requires a logged-in user (Admin or Super Admin).
// Role-specific gating (Super-Admin-only mutations) happens inside each
// router — see requireRole() calls in teamRoutes/roundRoutes, and the
// router-level requireRole('super_admin') in userRoutes/settingsRoutes.
app.use('/api', authMiddleware);

app.use('/api/teams', teamRoutes);
app.use('/api', roundRoutes); // mounts /api/rounds, /api/rounds/:id/sections, /api/sections/:id, /api/items/:id, etc.
app.use('/api', scoreRoutes); // mounts /api/scores, /api/leaderboard
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/export', exportRoutes);

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Locally (npm start / node api/index.js) we still want a normal running
// server. On Vercel, this file is imported and wrapped as a function, so
// app.listen is skipped there.
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
