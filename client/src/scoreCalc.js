// Mirrors the per-type math in api/rulesEngine.js — used for the live
// preview while judging, before the authoritative totals come back from the
// server on save.
export function calcSection(items, values) {
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

function findItemById(sections, itemId) {
  if (itemId == null) return null;
  for (const section of sections || []) {
    const item = (section.items || []).find((i) => String(i.id) === String(itemId));
    if (item) return { item, section };
  }
  return null;
}

function itemConditionMet(item, raw) {
  if (!item) return false;
  if (item.type === 'binary') return !!raw;
  if (item.type === 'multi') return Array.isArray(raw) && raw.length > 0;
  if (item.type === 'choice') return raw !== undefined && raw !== null && raw !== '';
  if (item.type === 'scale' || item.type === 'counter') return Number(raw) > 0;
  return false;
}

function applyPositiveMultiplier(sectionResults, factor) {
  let final_total = 0;
  for (const sr of Object.values(sectionResults)) {
    const breakdown = {};
    let total = 0;
    for (const [key, v] of Object.entries(sr.breakdown || {})) {
      const next = v > 0 ? v * factor : v;
      breakdown[key] = next;
      total += next;
    }
    sr.breakdown = breakdown;
    sr.total = total;
    final_total += total;
  }
  return final_total;
}

function multiplierFactor(round) {
  const n = Number(round?.positive_score_multiplier);
  return Number.isFinite(n) && n > 1 ? n : 0;
}

// Computes every section's total + the round's final_total for a nested
// { sections: [{key, items}] } round-rules payload and a values object keyed
// by section key. Optional `round` may include floor_negative_total_to_zero
// and the positive-only multiplier (trigger item + factor).
export function calcRoundTotals(sections, values, round) {
  const v = values || {};
  const sectionResults = {};
  let final_total = 0;
  for (const section of sections || []) {
    const { total, breakdown } = calcSection(section.items, v[section.key] || {});
    sectionResults[section.key] = { total, breakdown };
    final_total += total;
  }

  const factor = multiplierFactor(round);
  const found = findItemById(sections, round?.positive_multiplier_trigger_item_id);
  let multiplier = null;
  if (factor && found) {
    const raw = (v[found.section.key] || {})[found.item.key];
    if (itemConditionMet(found.item, raw)) {
      final_total = applyPositiveMultiplier(sectionResults, factor);
      multiplier = { applied: true, factor, triggerLabel: found.item.label };
    }
  }

  if (round?.floor_negative_total_to_zero && final_total < 0) {
    final_total = 0;
  }
  return { sectionResults, final_total, multiplier };
}
