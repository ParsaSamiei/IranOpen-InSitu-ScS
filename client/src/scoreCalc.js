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

// Computes every section's total + the round's final_total for a nested
// { sections: [{key, items}] } round-rules payload and a values object keyed
// by section key. Optional `round` may include floor_negative_total_to_zero.
export function calcRoundTotals(sections, values, round) {
  const v = values || {};
  const sectionResults = {};
  let final_total = 0;
  for (const section of sections || []) {
    const { total, breakdown } = calcSection(section.items, v[section.key] || {});
    sectionResults[section.key] = { total, breakdown };
    final_total += total;
  }
  if (round?.floor_negative_total_to_zero && final_total < 0) {
    final_total = 0;
  }
  return { sectionResults, final_total };
}
