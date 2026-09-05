const express = require('express');
const { pool } = require('../db');
const { calculateTotals } = require('../rulesEngine');
const { listScores, leaderboard } = require('../helpers/scoreQueries');

const router = express.Router();

router.get('/scores', async (req, res) => {
  try {
    const rows = await listScores({
      team_id: req.query.team_id,
      round_id: req.query.round_id,
      league: req.query.league,
      includeJudge: true,
    });
    res.json(rows);
  } catch (err) {
    console.error('Scores query failed:', err);
    res.status(500).json({ error: 'خطا در بارگذاری سوابق' });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const rows = await leaderboard({ league: req.query.league });
    res.json(rows);
  } catch (err) {
    console.error('Leaderboard query failed:', err);
    res.status(500).json({ error: 'خطا در بارگذاری رده‌بندی' });
  }
});

router.post('/scores', async (req, res) => {
  const {
    team_id, round_id, values, judge_name, round_time_seconds,
    captain_name, captain_signature,
  } = req.body || {};

  if (!team_id || !round_id) {
    return res.status(400).json({ error: 'ورودی نامعتبر است (تیم یا راند)' });
  }

  const { rows: teamRows } = await pool.query('SELECT * FROM teams WHERE id = $1', [team_id]);
  const team = teamRows[0];
  if (!team) return res.status(400).json({ error: 'تیم یافت نشد' });

  const { rows: roundRows } = await pool.query('SELECT * FROM rounds WHERE id = $1', [round_id]);
  const round = roundRows[0];
  if (!round) return res.status(400).json({ error: 'راند یافت نشد' });

  if (round.league !== team.league) {
    return res.status(400).json({ error: 'لیگ این راند با لیگ تیم مطابقت ندارد' });
  }

  // Captain signature: required when the round asks for it. With multiple
  // tries, one signature covers every try for that team+round — later tries
  // reuse (and copy) the signature already on file.
  let resolvedCaptainName = captain_name || null;
  let resolvedCaptainSignature = captain_signature || null;

  if (round.allows_multiple_tries && !resolvedCaptainSignature) {
    const { rows: priorSig } = await pool.query(
      `SELECT captain_name, captain_signature FROM score_entries
       WHERE team_id = $1 AND round_id = $2
         AND captain_signature IS NOT NULL AND captain_signature <> ''
       ORDER BY created_at ASC, id ASC
       LIMIT 1`,
      [team_id, round_id]
    );
    if (priorSig[0]) {
      resolvedCaptainSignature = priorSig[0].captain_signature;
      if (!resolvedCaptainName) resolvedCaptainName = priorSig[0].captain_name;
    }
  }

  if (round.requires_captain_signature && !resolvedCaptainSignature) {
    return res.status(400).json({ error: 'برای ثبت این راند، امضای کاپیتان تیم الزامی است' });
  }
  if (round.requires_timer && (round_time_seconds == null || round_time_seconds === '')) {
    return res.status(400).json({ error: 'برای ثبت این راند، زمان راند الزامی است' });
  }

  const timeSeconds = round_time_seconds != null && round_time_seconds !== ''
    ? Math.max(0, Number(round_time_seconds) || 0)
    : null;

  try {
    const totals = await calculateTotals(round_id, values || {});
    const section_totals = {};
    for (const [key, r] of Object.entries(totals.section_results)) section_totals[key] = r.total;

    const { rows } = await pool.query(
      `INSERT INTO score_entries
         (team_id, round_id, values_json, section_totals_json, final_total, round_time_seconds, judge_name, captain_name, captain_signature, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        team_id, round_id, JSON.stringify(values || {}), JSON.stringify(section_totals), totals.final_total,
        timeSeconds, judge_name || null, resolvedCaptainName, resolvedCaptainSignature, req.user?.sub || null,
      ]
    );
    res.json({ id: rows[0].id, section_totals, final_total: totals.final_total });
  } catch (err) {
    console.error('Create score failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'خطا در ذخیره امتیاز' });
  }
});

router.put('/scores/:id', async (req, res) => {
  const { values, judge_name, round_time_seconds, captain_name, captain_signature } = req.body || {};
  const { rows: existingRows } = await pool.query('SELECT * FROM score_entries WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'رکورد یافت نشد' });

  const timeSeconds = round_time_seconds != null && round_time_seconds !== ''
    ? Math.max(0, Number(round_time_seconds) || 0)
    : existing.round_time_seconds;

  try {
    const totals = await calculateTotals(existing.round_id, values || {});
    const section_totals = {};
    for (const [key, r] of Object.entries(totals.section_results)) section_totals[key] = r.total;

    await pool.query(
      `UPDATE score_entries
       SET values_json=$1, section_totals_json=$2, final_total=$3, judge_name=$4, round_time_seconds=$5,
           captain_name=$6, captain_signature=$7, updated_at=NOW(), updated_by=$8
       WHERE id=$9`,
      [
        JSON.stringify(values || {}), JSON.stringify(section_totals), totals.final_total,
        judge_name != null ? judge_name : existing.judge_name,
        timeSeconds,
        captain_name != null ? captain_name : existing.captain_name,
        captain_signature != null ? captain_signature : existing.captain_signature,
        req.user?.sub || null,
        req.params.id,
      ]
    );
    res.json({ id: Number(req.params.id), section_totals, final_total: totals.final_total });
  } catch (err) {
    console.error('Update score failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'خطا در ذخیره امتیاز' });
  }
});

router.delete('/scores/:id', async (req, res) => {
  await pool.query('DELETE FROM score_entries WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
