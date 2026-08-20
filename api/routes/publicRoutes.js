const express = require('express');
const { pool } = require('../db');
const { listScores, leaderboard } = require('../helpers/scoreQueries');

const router = express.Router();

router.get('/settings', async (req, res) => {
  const { rows } = await pool.query('SELECT key, value FROM competition_settings');
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

router.get('/teams', async (req, res) => {
  const { league } = req.query;
  const { rows } = league
    ? await pool.query('SELECT id, name, league FROM teams WHERE league = $1 ORDER BY name', [league])
    : await pool.query('SELECT id, name, league FROM teams ORDER BY league, name');
  res.json(rows);
});

router.get('/leaderboard', async (req, res) => {
  try {
    const rows = await leaderboard({ league: req.query.league });
    res.json(rows);
  } catch (err) {
    console.error('Public leaderboard query failed:', err);
    res.status(500).json({ error: 'خطا در بارگذاری رده‌بندی' });
  }
});

// judge_name stripped from the public payload; captain_signature is shown
// as-is (image included) — resolved in CHANGE_AND_MIGRATION_PLAN.md §7.
router.get('/history', async (req, res) => {
  try {
    const rows = await listScores({
      team_id: req.query.team_id,
      league: req.query.league,
      includeJudge: false,
    });
    res.json(rows);
  } catch (err) {
    console.error('Public history query failed:', err);
    res.status(500).json({ error: 'خطا در بارگذاری سوابق' });
  }
});

module.exports = router;
