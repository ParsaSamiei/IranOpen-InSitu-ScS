const express = require('express');
const { pool } = require('../db');
const { LEAGUES } = require('../constants');
const { requireRole } = require('../auth');

const router = express.Router();

// Listing teams is available to any logged-in role (Admin needs it to pick a
// team for score entry) — only creating/deleting a team is Super-Admin-only,
// per the §5 permissions table ("Add/delete teams" vs. score entry needing a
// team list to exist at all).
router.get('/', async (req, res) => {
  const { league } = req.query;
  const { rows } = league
    ? await pool.query('SELECT * FROM teams WHERE league = $1 ORDER BY name', [league])
    : await pool.query('SELECT * FROM teams ORDER BY league, name');
  res.json(rows);
});

router.post('/', requireRole('super_admin'), async (req, res) => {
  const { name, league } = req.body || {};
  if (!name || !LEAGUES.includes(league)) {
    return res.status(400).json({ error: 'نام تیم یا رده لیگ نامعتبر است' });
  }
  const { rows } = await pool.query(
    'INSERT INTO teams (name, league) VALUES ($1, $2) RETURNING id',
    [name.trim(), league]
  );
  res.json({ id: rows[0].id, name: name.trim(), league });
});

router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  await pool.query('DELETE FROM teams WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
