// RTL-safe numeric display: minus sign stays on the left (e.g. −15, not 15−).
export function formatScoreNum(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '0';
  if (n < 0) return `−${Math.abs(n)}`;
  return String(n);
}

export function ScoreNum({ value }) {
  return <span className="num-ltr" dir="ltr">{formatScoreNum(value)}</span>;
}

export function formatRoundTime(totalSeconds) {
  if (totalSeconds == null || totalSeconds === '') return '—';
  const n = Number(totalSeconds);
  if (Number.isNaN(n) || n < 0) return '—';
  // Work in tenths of a second internally so float rounding (e.g. 0.1 + 0.2)
  // never produces a display glitch like "12.30000000000001".
  const totalTenths = Math.round(n * 10);
  const m = Math.floor(totalTenths / 600);
  const s = Math.floor((totalTenths % 600) / 10);
  const t = totalTenths % 10;
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

export function roundTimeToSeconds(minutes, seconds, tenths) {
  const m = Math.max(0, Number(minutes) || 0);
  const s = Math.max(0, Math.min(59, Number(seconds) || 0));
  const t = Math.max(0, Math.min(9, Number(tenths) || 0));
  return Math.round((m * 60 + s + t / 10) * 10) / 10;
}
