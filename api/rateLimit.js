// ============================================================================
// Login rate limiting.
//
// Two independent limiters, applied in this order on POST /api/login:
//
//   1. per-IP     — blunt instrument that stops one host from hammering the
//                   endpoint at all. Deliberately generous, because a whole
//                   judging venue usually shares one public IP (NAT), so a
//                   tight per-IP limit would lock out every judge at once.
//   2. per-username — the actual brute-force protection: it follows the
//                   targeted account, so rotating IPs doesn't help an
//                   attacker, and it can't be loosened by NAT.
//
// Both only count FAILED attempts (skipSuccessfulRequests), so a judge who
// logs in normally never burns quota, and a successful login clears that
// username's failure count (see resetUsername() — proof of possession of the
// password means the failures weren't an attack on that account).
//
// The store is in-memory and therefore per-process. That's correct for the
// documented deployment (one Node container behind nginx — see
// deploy/docker-compose.yml). If this is ever run as multiple replicas or on
// Vercel's serverless functions, each instance keeps its own counters, so the
// effective limit is (limit × instances) — swap in a shared store
// (rate-limit-redis) at that point.
// ============================================================================

const { rateLimit } = require('express-rate-limit');

const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_PER_IP = 30;
const DEFAULT_MAX_PER_USER = 8;

// Longest username we'll use as a limiter key. Each distinct key is one entry
// in the memory store, so an attacker spraying random usernames would
// otherwise grow it unbounded; truncating (plus the per-IP limiter in front,
// which caps how many keys any one host can create per window) keeps that
// bounded. 64 is well past any real username here.
const MAX_KEY_LENGTH = 64;

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.warn(`[rateLimit] ${name}="${raw}" is not a non-negative number — using default ${fallback}.`);
    return fallback;
  }
  return Math.floor(n);
}

const WINDOW_MS = intFromEnv('LOGIN_RATE_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS);
const MAX_PER_IP = intFromEnv('LOGIN_RATE_LIMIT_MAX_PER_IP', DEFAULT_MAX_PER_IP);
const MAX_PER_USER = intFromEnv('LOGIN_RATE_LIMIT_MAX_PER_USER', DEFAULT_MAX_PER_USER);

// Error strings elsewhere in the API are Persian with Persian digits
// ("حداقل ۶ کاراکتر"), so convert by hand rather than relying on the runtime
// having full ICU for toLocaleString('fa-IR').
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function faNum(n) {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

// Whole minutes until this key's window rolls over, for the error message.
// resetTime is set by express-rate-limit on req.rateLimit; fall back to the
// full window if a store ever omits it.
function minutesUntilReset(req) {
  const resetTime = req.rateLimit?.resetTime;
  const ms = resetTime ? resetTime.getTime() - Date.now() : WINDOW_MS;
  return Math.max(1, Math.ceil(ms / 60000));
}

function normalizeUsername(value) {
  if (typeof value !== 'string') return '';
  // Lowercased so an attacker can't get a fresh bucket per casing variant.
  // Usernames themselves stay case-sensitive at lookup time (auth.js) — this
  // only affects which counter an attempt lands in, and merging two accounts
  // that differ only by case into one bucket errs toward being stricter.
  return value.trim().toLowerCase().slice(0, MAX_KEY_LENGTH);
}

// A limiter whose limit is 0 is treated as "disabled" rather than "block
// everything" — an intentional escape hatch for a live competition, where
// setting LOGIN_RATE_LIMIT_MAX_PER_IP=0 and restarting is the fastest way for
// an operator to get judges back in if the limits turn out to be too tight.
function passthrough(req, res, next) {
  next();
}
passthrough.resetKey = () => {};

function buildLimiter({ limit, keyGenerator, logLabel, message }) {
  if (limit <= 0) {
    console.warn(`[rateLimit] ${logLabel} limiter is DISABLED (limit set to 0).`);
    return passthrough;
  }
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    keyGenerator,
    // Only failed logins count toward the limit.
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7', // RateLimit / RateLimit-Policy + Retry-After
    legacyHeaders: false,
    handler: (req, res) => {
      const minutes = minutesUntilReset(req);
      console.warn(
        `[rateLimit] blocked login (${logLabel}) ip=${req.ip} ` +
          `username="${normalizeUsername(req.body?.username)}" retry_in_min=${minutes}`
      );
      res.status(429).json({ error: message(minutes) });
    },
  });
}

// Keyed on req.ip, which depends on the app's 'trust proxy' setting — see the
// note where that's configured in api/index.js. Uses the library's default
// key generator so IPv6 clients are keyed by /56 subnet instead of by single
// address (a single client can otherwise hold a whole /64).
const loginIpLimiter = buildLimiter({
  limit: MAX_PER_IP,
  keyGenerator: undefined,
  logLabel: 'per-IP',
  message: (minutes) =>
    `تلاش‌های ناموفق ورود از این دستگاه بیش از حد مجاز است. لطفاً ${faNum(minutes)} دقیقه دیگر دوباره تلاش کنید.`,
});

const loginUsernameLimiter = buildLimiter({
  limit: MAX_PER_USER,
  // Empty/missing usernames share one bucket; those requests can never
  // succeed anyway (auth.js rejects falsy usernames), and pooling them keeps
  // junk out of the store.
  keyGenerator: (req) => `user:${normalizeUsername(req.body?.username) || '(empty)'}`,
  logLabel: 'per-username',
  message: (minutes) =>
    `تلاش‌های ناموفق ورود برای این نام کاربری بیش از حد مجاز است. لطفاً ${faNum(minutes)} دقیقه دیگر دوباره تلاش کنید.`,
});

// Called after a successful login to clear that username's failure count, so
// a judge who mistyped their password several times before getting it right
// isn't left one typo away from a lockout.
function resetUsername(username) {
  const key = `user:${normalizeUsername(username) || '(empty)'}`;
  loginUsernameLimiter.resetKey?.(key);
}

module.exports = { loginIpLimiter, loginUsernameLimiter, resetUsername };
