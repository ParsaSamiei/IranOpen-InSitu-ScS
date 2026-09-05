const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const { LEAGUES } = require("./constants");

// Vercel/Neon Postgres connection string, set in your Vercel project's
// Environment Variables as DATABASE_URL. For local dev, put it in root `.env`.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to the root .env file (see .env.example).",
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|sslmode=disable/.test(process.env.DATABASE_URL)
    ? false
    : { rejectUnauthorized: false },
});

const leagueCheck = LEAGUES.map((l) => `'${l.replace(/'/g, "''")}'`).join(", ");

const DEFAULT_SETTINGS = {
  competition_name: "مسابقات ایران‌اپن — لیگ طراحی و ساخت",
  subtitle: "",
  logo_url: "",
};

let initPromise = null;

// This is a one-time, self-healing schema cutover (see CHANGE_AND_MIGRATION_PLAN.md
// §9): if an old-shape `score_entries` table exists (no `round_id` column),
// rename it out of the way instead of dropping it, so the new schema can be
// created cleanly without destroying anything by accident. Safe to run on
// every cold start — once the table is either absent or already new-shape,
// this is a no-op.
async function renameLegacyScoreEntriesIfNeeded(client) {
  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'score_entries'
  `);
  if (rows.length === 0) return; // table doesn't exist yet — nothing to do
  const cols = rows.map((r) => r.column_name);
  if (cols.includes("round_id")) return; // already the new shape

  const legacyName = "score_entries_legacy_IranOpen-InSitu";
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${legacyName}') THEN
        ALTER TABLE score_entries RENAME TO ${legacyName};
      END IF;
    END $$;
  `);
  console.warn(
    `[db] Old-shape score_entries table found and renamed to "${legacyName}". ` +
      `This is a one-time fresh-start schema cutover — see CHANGE_AND_MIGRATION_PLAN.md §9. ` +
      `Nothing reads from the legacy table anymore; drop it manually once you've confirmed you don't need it.`,
  );
}

// Creates the new tables if they don't exist yet. Safe to call on every cold
// start since CREATE TABLE IF NOT EXISTS is idempotent. We cache the promise
// so concurrent requests during a cold start don't race each other.
function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      const client = pool;

      await renameLegacyScoreEntriesIfNeeded(client);

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT,
          role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin')),
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS rounds (
          id SERIAL PRIMARY KEY,
          league TEXT NOT NULL CHECK (league IN (${leagueCheck})),
          round_number INTEGER NOT NULL,
          label TEXT,
          requires_timer BOOLEAN NOT NULL DEFAULT true,
          requires_captain_signature BOOLEAN NOT NULL DEFAULT true,
          floor_negative_total_to_zero BOOLEAN NOT NULL DEFAULT false,
          allows_multiple_tries BOOLEAN NOT NULL DEFAULT false,
          scores_visible BOOLEAN NOT NULL DEFAULT true,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (league, round_number)
        );

        CREATE TABLE IF NOT EXISTS rule_sections (
          id SERIAL PRIMARY KEY,
          round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          label TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE (round_id, key)
        );

        CREATE TABLE IF NOT EXISTS rule_items (
          id SERIAL PRIMARY KEY,
          section_id INTEGER NOT NULL REFERENCES rule_sections(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          label TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('binary', 'multi', 'choice', 'scale', 'counter')),
          points REAL NOT NULL DEFAULT 0,
          options_json TEXT,
          choices_json TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE (section_id, key)
        );

        CREATE TABLE IF NOT EXISTS teams (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          league TEXT NOT NULL CHECK (league IN (${leagueCheck})),
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS score_entries (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
          values_json TEXT NOT NULL,
          section_totals_json TEXT NOT NULL,
          final_total REAL NOT NULL,
          round_time_seconds REAL,
          judge_name TEXT,
          captain_name TEXT,
          captain_signature TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_score_entries_team ON score_entries(team_id);
        CREATE INDEX IF NOT EXISTS idx_score_entries_round ON score_entries(round_id);
        CREATE INDEX IF NOT EXISTS idx_rule_sections_round ON rule_sections(round_id);
        CREATE INDEX IF NOT EXISTS idx_rule_items_section ON rule_items(section_id);

        CREATE TABLE IF NOT EXISTS competition_settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);

      // Idempotent column adds for DBs created before these flags existed.
      await client.query(`
        ALTER TABLE rounds
        ADD COLUMN IF NOT EXISTS floor_negative_total_to_zero BOOLEAN NOT NULL DEFAULT false
      `);
      await client.query(`
        ALTER TABLE rounds
        ADD COLUMN IF NOT EXISTS allows_multiple_tries BOOLEAN NOT NULL DEFAULT false
      `);
      await client.query(`
        ALTER TABLE rounds
        ADD COLUMN IF NOT EXISTS scores_visible BOOLEAN NOT NULL DEFAULT true
      `);

      await ensureDefaultSettings();
      await ensureBootstrapSuperAdmin();
    })();
  }
  return initPromise;
}

// competition_settings starts seeded with the new competition's name so the
// site never falls back to an empty header before a Super Admin edits it.
async function ensureDefaultSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query(
      `INSERT INTO competition_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [key, value],
    );
  }
}

// Idempotent, self-healing bootstrap (per CHANGE_AND_MIGRATION_PLAN.md §10.4):
// on every startup, if no super_admin exists yet, create one from env vars.
// No-ops once a super_admin row exists, so it's safe to leave the env vars
// set permanently — this also means the DB can be recreated (e.g. a fresh
// Neon branch) and the app self-heals on next boot.
async function ensureBootstrapSuperAdmin() {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`,
  );
  if (rows.length > 0) return;

  const username = process.env.BOOTSTRAP_SUPERADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;
  if (!username || !password) {
    console.warn(
      "[db] No super_admin account exists yet, and BOOTSTRAP_SUPERADMIN_USERNAME/" +
        "BOOTSTRAP_SUPERADMIN_PASSWORD are not set. Set them and restart the server " +
        "to create the first Super Admin account.",
    );
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'super_admin')
     ON CONFLICT (username) DO NOTHING`,
    [username, password_hash, "مدیر کل"],
  );
  console.log(`[db] Bootstrap Super Admin account ready: ${username}`);
}

module.exports = { pool, initDb };
