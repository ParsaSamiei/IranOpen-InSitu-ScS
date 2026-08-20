const express = require('express');
const { pool } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();
router.use(requireRole('super_admin'));

const ALLOWED_KEYS = ['competition_name', 'subtitle', 'logo_url'];

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT key, value FROM competition_settings');
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

router.put('/', async (req, res) => {
  const updates = Object.entries(req.body || {}).filter(([k]) => ALLOWED_KEYS.includes(k));
  if (updates.length === 0) {
    return res.status(400).json({ error: 'هیچ تنظیمات معتبری برای ذخیره ارسال نشده است' });
  }
  for (const [key, value] of updates) {
    await pool.query(
      `INSERT INTO competition_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value == null ? '' : String(value)]
    );
  }
  const { rows } = await pool.query('SELECT key, value FROM competition_settings');
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

module.exports = router;
