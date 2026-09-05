const express = require('express');
const { pool } = require('../db');
const { LEAGUES, RULE_ITEM_TYPES } = require('../constants');
const { requireRole } = require('../auth');
const { loadRoundRules } = require('../rulesEngine');

const router = express.Router();

// ---------- Rounds ----------
// GET is open to any logged-in role: Admin needs the round list to enter
// scores; only the rule-builder mutations below are Super-Admin-only.
router.get('/rounds', async (req, res) => {
  const { league } = req.query;
  const { rows } = league
    ? await pool.query('SELECT * FROM rounds WHERE league = $1 ORDER BY sort_order, round_number', [league])
    : await pool.query('SELECT * FROM rounds ORDER BY league, sort_order, round_number');
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
    scores_visible = true, sort_order,
  } = req.body || {};
  if (!LEAGUES.includes(league) || !round_number) {
    return res.status(400).json({ error: 'لیگ یا شماره راند نامعتبر است' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO rounds (
         league, round_number, label, requires_timer, requires_captain_signature,
         floor_negative_total_to_zero, allows_multiple_tries, scores_visible, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        league, Number(round_number), label || null,
        !!requires_timer, !!requires_captain_signature, !!floor_negative_total_to_zero,
        !!allows_multiple_tries, scores_visible !== false,
        sort_order != null ? Number(sort_order) : Number(round_number),
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
    sort_order = existing.sort_order,
  } = req.body || {};

  try {
    const { rows } = await pool.query(
      `UPDATE rounds SET round_number=$1, label=$2, requires_timer=$3, requires_captain_signature=$4,
        floor_negative_total_to_zero=$5, allows_multiple_tries=$6, scores_visible=$7, sort_order=$8
       WHERE id=$9 RETURNING *`,
      [
        Number(round_number), label, !!requires_timer, !!requires_captain_signature,
        !!floor_negative_total_to_zero, !!allows_multiple_tries, scores_visible !== false,
        Number(sort_order), req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'این شماره راند برای این لیگ قبلاً ثبت شده است' });
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
