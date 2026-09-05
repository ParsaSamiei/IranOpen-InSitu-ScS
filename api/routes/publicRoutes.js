const express = require('express');
const { pool } = require('../db');
const { listScores, leaderboard } = require('../helpers/scoreQueries');
const { loadRoundRules } = require('../rulesEngine');

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
    const rows = await leaderboard({ league: req.query.league, forPublic: true });
    res.json(rows);
  } catch (err) {
    console.error('Public leaderboard query failed:', err);
    res.status(500).json({ error: 'خطا در بارگذاری رده‌بندی' });
  }
});

// judge_name stripped from the public payload; captain_signature is shown
// as-is (image included) — resolved in CHANGE_AND_MIGRATION_PLAN.md §7.
// Rounds with scores_visible=false are returned scrubbed (scores_hidden).
router.get('/history', async (req, res) => {
  try {
    const rows = await listScores({
      team_id: req.query.team_id,
      league: req.query.league,
      includeJudge: false,
      forPublic: true,
    });
    res.json(rows);
  } catch (err) {
    console.error('Public history query failed:', err);
    res.status(500).json({ error: 'خطا در بارگذاری سوابق' });
  }
});

// A round's sections/items (the same shape the admin rule builder and score
// form use) so the public history "نمایش" modal can render a record's
// breakdown without needing to hit an authenticated route.
router.get('/rounds/:id/sections', async (req, res) => {
  try {
    const { round, sections } = await loadRoundRules(req.params.id);
    if (round.scores_visible === false) {
      return res.status(403).json({ error: 'امتیاز این راند مخفی است' });
    }
    res.json({ round, sections });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'خطا در بارگذاری قوانین راند' });
  }
});

module.exports = router;

