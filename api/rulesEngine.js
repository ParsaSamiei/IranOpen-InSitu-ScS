// ============================================================================
// Scoring rules engine — DB-driven version of the old scoringConfig.js.
//
// The per-type math (binary/multi/choice/scale/counter) is unchanged from
// the original hardcoded engine; what changed is *where the shape comes
// from*: instead of a static LEAGUES object, a round's sections and items
// are rows in rule_sections/rule_items, loaded per round_id.
//
// Item "type" meanings (unchanged):
//   binary  -> single checkbox. Checked = full points, unchecked = 0.
//   multi   -> a list of options (numbered or labeled). Judge checks any subset.
//              score = points * (number of options checked)
//   choice  -> pick exactly ONE option from a list; each option carries its own value
//   scale   -> judge enters a number from 0 up to the item's max points
//   counter -> open-ended repeatable count, score = points * count
// ============================================================================

const { pool } = require('./db');

function parseItemRow(row) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type,
    points: row.points,
    sort_order: row.sort_order,
    options: row.options_json ? JSON.parse(row.options_json) : undefined,
    choices: row.choices_json ? JSON.parse(row.choices_json) : undefined,
  };
}

// Loads a round plus its sections (each with items nested), ordered for display.
async function loadRoundRules(round_id) {
  const { rows: roundRows } = await pool.query('SELECT * FROM rounds WHERE id = $1', [round_id]);
  const round = roundRows[0];
  if (!round) {
    const err = new Error('راند نامعتبر است');
    err.status = 400;
    throw err;
  }

  const { rows: sectionRows } = await pool.query(
    'SELECT * FROM rule_sections WHERE round_id = $1 ORDER BY sort_order, id',
    [round_id]
  );
  const sectionIds = sectionRows.map((s) => s.id);

  let itemRows = [];
  if (sectionIds.length > 0) {
    const { rows } = await pool.query(
      'SELECT * FROM rule_items WHERE section_id = ANY($1) ORDER BY sort_order, id',
      [sectionIds]
    );
    itemRows = rows;
  }

  const sections = sectionRows.map((s) => ({
    id: s.id,
    key: s.key,
    label: s.label,
    sort_order: s.sort_order,
    items: itemRows.filter((i) => i.section_id === s.id).map(parseItemRow),
  }));

  return { round, sections };
}

// Same per-type math as the original client/server engine, operating on a
// dynamic item list instead of a fixed one.
function calcSection(items, values) {
  let total = 0;
  const breakdown = {};
  for (const item of items) {
    let v = 0;
    const raw = values ? values[item.key] : undefined;
    if (item.type === 'binary') {
      v = raw ? item.points : 0;
    } else if (item.type === 'multi') {
      const count = Array.isArray(raw) ? raw.length : 0;
      v = item.points * count;
    } else if (item.type === 'choice') {
      const found = (item.choices || []).find((c) => c.value === raw);
      v = found ? found.value : 0;
    } else if (item.type === 'scale') {
      const n = Number(raw) || 0;
      v = Math.max(0, Math.min(item.points, n));
    } else if (item.type === 'counter') {
      const n = Number(raw) || 0;
      v = item.points * n;
    }
    breakdown[item.key] = v;
    total += v;
  }
  return { total, breakdown };
}

// calculateTotals(round_id, values) -> loads the round's rules from the DB,
// runs the same per-type math that existed before, and returns a flexible
// { [section_key]: {total, breakdown} } map plus final_total — replacing the
// old fixed { performance, technical, negative, group, final_total } shape.
async function calculateTotals(round_id, values) {
  const { round, sections } = await loadRoundRules(round_id);
  const v = values || {};

  const section_results = {};
  let final_total = 0;
  for (const section of sections) {
    const { total, breakdown } = calcSection(section.items, v[section.key] || {});
    section_results[section.key] = { total, breakdown, label: section.label };
    final_total += total;
  }

  return { round, sections, section_results, final_total };
}

module.exports = { loadRoundRules, calcSection, calculateTotals };
