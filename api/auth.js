const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return secret;
}

// Token shape carries the role now, since requireRole() needs it on every
// request without a DB round-trip. Same HMAC-signed-JSON mechanism as
// before — just backed by a real user row instead of a hardcoded env check.
function createToken(user) {
  const secret = getSecret();
  if (!secret) throw new Error('AUTH_SECRET باید تنظیم شود');
  const payload = {
    sub: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  const secret = getSecret();
  if (!secret || !token) return null;

  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Looks up the user by username and checks the bcrypt hash. Returns the user
// row (minus password_hash) on success, or null.
async function validateCredentials(username, password) {
  if (!username || !password) return null;
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'ورود لازم است' });
  }
  req.user = payload;
  next();
}

// requireRole('super_admin') gates Super-Admin-only routes; requireRole('admin', 'super_admin')
// (the default when called with no args) just re-asserts "any logged-in role", useful for
// readability at the top of a router even though authMiddleware already ran.
function requireRole(...roles) {
  const allowed = roles.length ? roles : ['admin', 'super_admin'];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز است' });
    }
    next();
  };
}

module.exports = { createToken, verifyToken, validateCredentials, authMiddleware, requireRole, getSecret };
