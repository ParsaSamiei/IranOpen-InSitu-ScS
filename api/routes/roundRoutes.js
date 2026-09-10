const express = require('express');
const { pool } = require('../db');
const { LEAGUES, ROUND_LEAGUES, SUPERTEAM_LEAGUE, RULE_ITEM_TYPES } = require('../constants');
const { requireRole } = require('../auth');
const { loadRoundRules } = require('../rulesEngine');

const router = express.Router();

// Factor of 1 or less (or empty) means the multiplier is off.
function parseMultiplierFactor(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 1) return null;
  return n;
}

// Best score in a round scales to this value (default 100).
function parseNormalizeTo(raw, fallback = 100) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error('سقف نرمال‌سازی باید عددی بزرگ‌تر از صفر باشد');
    err.status = 400;
    throw err;
  }
  return n;
}

function parseTriggerItemId(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function assertTriggerBelongsToRound(triggerItemId, roundId) {
  if (!triggerItemId || !roundId) return;
  const { rows } = await pool.query(
    `SELECT i.id FROM rule_items i
     JOIN rule_sections s ON i.section_id = s.id
     WHERE i.id = $1 AND s.round_id = $2`,
    [triggerItemId, roundId]
  );
  if (!rows[0]) {
    const err = new Error('آیتم شرط ضریب باید متعلق به همین راند باشد');
    err.status = 400;
    throw err;
  }
}

// ---------- Rounds ----------
// GET is open to any logged-in role: Admin needs the round list to enter
// scores; only the rule-builder mutations below are Super-Admin-only.
router.get('/rounds', async (req, res) => {
  const { league } = req.query;
  let rows;
  if (!league) {
    ({ rows } = await pool.query('SELECT * FROM rounds ORDER BY league, sort_order, round_number'));
  } else if (league === SUPERTEAM_LEAGUE) {
    ({ rows } = await pool.query(
      `SELECT * FROM rounds
       WHERE league = $1 OR is_superteam = true
       ORDER BY sort_order, round_number`,
      [SUPERTEAM_LEAGUE]
    ));
  } else if (LEAGUES.includes(league)) {
    // Home-league rounds plus rounds marked shared from the other real league.
    ({ rows } = await pool.query(
      `SELECT * FROM rounds
       WHERE COALESCE(is_superteam, false) = false
         AND league <> $2
         AND (
           league = $1
           OR (shared_across_leagues = true AND league = ANY($3::text[]))
         )
       ORDER BY sort_order, round_number`,
      [league, SUPERTEAM_LEAGUE, LEAGUES]
    ));
  } else {
    ({ rows } = await pool.query(
      'SELECT * FROM rounds WHERE league = $1 ORDER BY sort_order, round_number',
      [league]
    ));
  }
  res.json(rows);
});

router.get('/rounds/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM rounds WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'راند یافت نشد' });
  res.json(rows[0]);
});

// Round + its sections + each section's items, nested — one call for both
// the Score Entry form and the Rule Builder to render a round's full rules.
router.get('/rounds/:id/sections', async (req, res) => {
  try {
    const { round, sections } = await loadRoundRules(req.params.id);
    res.json({ round, sections });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'خطا در بارگذاری قوانین راند' });
  }
});

router.post('/rounds', requireRole('super_admin'), async (req, res) => {
  const {
    league, round_number, label,
    requires_timer = true, requires_captain_signature = true,
    floor_negative_total_to_zero = false, allows_multiple_tries = false,
    scores_visible = true, is_superteam = false, shared_across_leagues = false,
    sort_order, positive_score_multiplier, normalize_to,
  } = req.body || {};
  if (!ROUND_LEAGUES.includes(league) || !round_number) {
    return res.status(400).json({ error: 'لیگ یا شماره راند نامعتبر است' });
  }
  const superRound = !!is_superteam || league === SUPERTEAM_LEAGUE;
  const storedLeague = superRound ? SUPERTEAM_LEAGUE : league;
  if (!superRound && !LEAGUES.includes(storedLeague)) {
    return res.status(400).json({ error: 'لیگ نامعتبر است' });
  }
  // Shared rules only apply between the two real leagues, never سوپرتیم.
  const shared = !superRound && !!shared_across_leagues;
  // New rounds have no items yet, so a trigger item cannot be attached here.
  const multiplier = parseMultiplierFactor(positive_score_multiplier);
  let normalizeTo;
  try {
    normalizeTo = parseNormalizeTo(normalize_to, 100);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO rounds (
         league, round_number, label, requires_timer, requires_captain_signature,
         floor_negative_total_to_zero, allows_multiple_tries, scores_visible, is_superteam,
         shared_across_leagues, sort_order, positive_score_multiplier, normalize_to
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        storedLeague, Number(round_number), label || null,
        !!requires_timer, !!requires_captain_signature, !!floor_negative_total_to_zero,
        !!allows_multiple_tries, scores_visible !== false, superRound, shared,
        sort_order != null ? Number(sort_order) : Number(round_number),
        multiplier, normalizeTo,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'این شماره راند برای این لیگ قبلاً ثبت شده است' });
    }
    console.error('Create round failed:', err);
    res.status(500).json({ error: 'خطا در ایجاد راند' });
  }
});

router.put('/rounds/:id', requireRole('super_admin'), async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM rounds WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'راند یافت نشد' });

  const {
    round_number = existing.round_number,
    label = existing.label,
    requires_timer = existing.requires_timer,
    requires_captain_signature = existing.requires_captain_signature,
    floor_negative_total_to_zero = existing.floor_negative_total_to_zero,
    allows_multiple_tries = existing.allows_multiple_tries,
    scores_visible = existing.scores_visible,
    is_superteam = existing.is_superteam,
    shared_across_leagues = existing.shared_across_leagues,
    sort_order = existing.sort_order,
  } = req.body || {};

  const superRound = !!is_superteam || existing.league === SUPERTEAM_LEAGUE;
  const shared = !superRound && !!shared_across_leagues;
  const multiplier = req.body?.positive_score_multiplier !== undefined
    ? parseMultiplierFactor(req.body.positive_score_multiplier)
    : existing.positive_score_multiplier;
  const triggerItemId = req.body?.positive_multiplier_trigger_item_id !== undefined
    ? parseTriggerItemId(req.body.positive_multiplier_trigger_item_id)
    : existing.positive_multiplier_trigger_item_id;
  let normalizeTo;
  try {
    normalizeTo = req.body?.normalize_to !== undefined
      ? parseNormalizeTo(req.body.normalize_to, existing.normalize_to ?? 100)
      : (existing.normalize_to ?? 100);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await assertTriggerBelongsToRound(triggerItemId, req.params.id);
    const { rows } = await pool.query(
      `UPDATE rounds SET round_number=$1, label=$2, requires_timer=$3, requires_captain_signature=$4,
        floor_negative_total_to_zero=$5, allows_multiple_tries=$6, scores_visible=$7, is_superteam=$8,
        shared_across_leagues=$9, sort_order=$10, positive_score_multiplier=$11,
        positive_multiplier_trigger_item_id=$12, normalize_to=$13
       WHERE id=$14 RETURNING *`,
      [
        Number(round_number), label, !!requires_timer, !!requires_captain_signature,
        !!floor_negative_total_to_zero, !!allows_multiple_tries, scores_visible !== false,
        superRound, shared, Number(sort_order), multiplier, triggerItemId, normalizeTo,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.code === '23505') {
      return res.status(400).json({ error: 'این شماره راند برای این لیگ قبلاً ثبت شده است' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'آیتم شرط ضریب نامعتبر است' });
    }
    console.error('Update round failed:', err);
    res.status(500).json({ error: 'خطا در ویرایش راند' });
  }
});

router.delete('/rounds/:id', requireRole('super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM rounds WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    // ON DELETE RESTRICT on score_entries.round_id — protects judged data
    // from being silently wiped by deleting the round it belongs to.
    if (err.code === '23503') {
      return res.status(400).json({
        error: 'این راند دارای امتیازهای ثبت‌شده است؛ ابتدا آن‌ها را حذف کنید یا این راند را نگه دارید.',
      });
    }
    console.error('Delete round failed:', err);
    res.status(500).json({ error: 'خطا در حذف راند' });
  }
});

// ---------- Rule sections ----------
router.post('/rounds/:id/sections', requireRole('super_admin'), async (req, res) => {
  const { key, label, sort_order = 0 } = req.body || {};
  if (!key || !label) return res.status(400).json({ error: 'کلید و عنوان بخش الزامی است' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO rule_sections (round_id, key, label, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, key.trim(), label.trim(), Number(sort_order)]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'این کلید بخش در این راند قبلاً استفاده شده است' });
    if (err.code === '23503') return res.status(400).json({ error: 'راند نامعتبر است' });
    console.error('Create section failed:', err);
    res.status(500).json({ error: 'خطا در ایجاد بخش' });
  }
});

router.put('/sections/:id', requireRole('super_admin'), async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM rule_sections WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'بخش یافت نشد' });
  const { key = existing.key, label = existing.label, sort_order = existing.sort_order } = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE rule_sections SET key=$1, label=$2, sort_order=$3 WHERE id=$4 RETURNING *`,
      [key.trim(), label.trim(), Number(sort_order), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'این کلید بخش در این راند قبلاً استفاده شده است' });
    console.error('Update section failed:', err);
    res.status(500).json({ error: 'خطا در ویرایش بخش' });
  }
});

router.delete('/sections/:id', requireRole('super_admin'), async (req, res) => {
  await pool.query('DELETE FROM rule_sections WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Rule items ----------
router.get('/sections/:id/items', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM rule_items WHERE section_id = $1 ORDER BY sort_order, id',
    [req.params.id]
  );
  res.json(rows.map((r) => ({
    ...r,
    options: r.options_json ? JSON.parse(r.options_json) : undefined,
    choices: r.choices_json ? JSON.parse(r.choices_json) : undefined,
  })));
});

function validateItemBody(body) {
  const { key, label, type, points, options, choices } = body || {};
  if (!key || !label || !RULE_ITEM_TYPES.includes(type)) {
    return { error: 'کلید، عنوان یا نوع آیتم نامعتبر است' };
  }
  if (type === 'multi' && (!Array.isArray(options) || options.length === 0)) {
    return { error: 'برای آیتم چندگزینه‌ای، فهرست گزینه‌ها الزامی است' };
  }
  if (type === 'choice' && (!Array.isArray(choices) || choices.length === 0)) {
    return { error: 'برای آیتم انتخابی، فهرست گزینه‌ها با مقدار الزامی است' };
  }
  return {
    key: key.trim(),
    label: label.trim(),
    type,
    points: Number(points) || 0,
    options_json: type === 'multi' ? JSON.stringify(options) : null,
    choices_json: type === 'choice' ? JSON.stringify(choices) : null,
  };
}

router.post('/sections/:id/items', requireRole('super_admin'), async (req, res) => {
  const parsed = validateItemBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { sort_order = 0 } = req.body || {};
  try {
    const { rows } = await pool.query(
      `INSERT INTO rule_items (section_id, key, label, type, points, options_json, choices_json, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.id, parsed.key, parsed.label, parsed.type, parsed.points, parsed.options_json, parsed.choices_json, Number(sort_order)]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'این کلید آیتم در این بخش قبلاً استفاده شده است' });
    if (err.code === '23503') return res.status(400).json({ error: 'بخش نامعتبر است' });
    console.error('Create item failed:', err);
    res.status(500).json({ error: 'خطا در ایجاد آیتم' });
  }
});

router.put('/items/:id', requireRole('super_admin'), async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM rule_items WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'آیتم یافت نشد' });

  const merged = {
    key: existing.key, label: existing.label, type: existing.type, points: existing.points,
    options: existing.options_json ? JSON.parse(existing.options_json) : undefined,
    choices: existing.choices_json ? JSON.parse(existing.choices_json) : undefined,
    ...req.body,
  };
  const parsed = validateItemBody(merged);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const sort_order = req.body?.sort_order != null ? Number(req.body.sort_order) : existing.sort_order;

  try {
    const { rows } = await pool.query(
      `UPDATE rule_items SET key=$1, label=$2, type=$3, points=$4, options_json=$5, choices_json=$6, sort_order=$7
       WHERE id=$8 RETURNING *`,
      [parsed.key, parsed.label, parsed.type, parsed.points, parsed.options_json, parsed.choices_json, sort_order, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'این کلید آیتم در این بخش قبلاً استفاده شده است' });
    console.error('Update item failed:', err);
    res.status(500).json({ error: 'خطا در ویرایش آیتم' });
  }
});

router.delete('/items/:id', requireRole('super_admin'), async (req, res) => {
  await pool.query('DELETE FROM rule_items WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
