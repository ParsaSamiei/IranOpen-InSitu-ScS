const { pool } = require('../db');

// Shared by /api/scores (admin, includeJudge=true) and /api/public/history
// (includeJudge=false, per the migration plan's public-sanitization rule).
async function listScores({ team_id, round_id, league, includeJudge }) {
  let sql = `
    SELECT s.id, s.team_id, t.name AS team_name, t.league,
           s.round_id, r.round_number, r.label AS round_label,
           r.allows_multiple_tries,
           s.values_json, s.section_totals_json, s.final_total,
           s.round_time_seconds, s.captain_name, s.captain_signature,
           s.created_at, s.updated_at,
           CASE WHEN r.allows_multiple_tries THEN
             ROW_NUMBER() OVER (
               PARTITION BY s.team_id, s.round_id
               ORDER BY s.created_at ASC, s.id ASC
             )
           ELSE NULL END AS try_number
           ${includeJudge ? ', s.judge_name' : ''}
    FROM score_entries s
    JOIN teams t ON t.id = s.team_id
    JOIN rounds r ON r.id = s.round_id
    WHERE 1=1
  `;
  const params = [];
  if (team_id) { params.push(team_id); sql += ` AND s.team_id = $${params.length}`; }
  if (round_id) { params.push(round_id); sql += ` AND s.round_id = $${params.length}`; }
  if (league) { params.push(league); sql += ` AND t.league = $${params.length}`; }
  sql += ' ORDER BY s.created_at DESC';

  const { rows } = await pool.query(sql, params);
  return rows.map((r) => ({
    ...r,
    values_json: JSON.parse(r.values_json),
    section_totals_json: JSON.parse(r.section_totals_json),
    try_number: r.try_number != null ? Number(r.try_number) : null,
  }));
}

// Standings, per the new scoring rules:
//   - every round a team has played is shown, not just their best one
//   - ranking is by the TOTAL of each round's NORMALIZED score (best score in
//     that round = 100, everyone else scaled proportionally against it),
//     not by a single best round
//   - a round the team hasn't played yet counts as 0 toward the total (per
//     product decision), so it still shows up as a column/entry with
//     played:false
//   - ties on total normalized score are broken by the team's summed round
//     time (lower = better, missing times count as 0), then by name
//
// Authoritative score per team+round:
//   - allows_multiple_tries: best final_total wins; ties broken by lowest
//     round_time_seconds (missing time sorts last), then newest id
//   - otherwise (re-judge / single try): most recently updated row wins
async function leaderboard({ league }) {
  const teamParams = [];
  let teamSql = 'SELECT id, name, league FROM teams';
  if (league) { teamParams.push(league); teamSql += ' WHERE league = $1'; }
  teamSql += ' ORDER BY league, name';
  const { rows: teams } = await pool.query(teamSql, teamParams);
  if (teams.length === 0) return [];

  const leagues = [...new Set(teams.map((t) => t.league))];

  const { rows: rounds } = await pool.query(
    `SELECT id, league, round_number, label, sort_order
     FROM rounds WHERE league = ANY($1)
     ORDER BY sort_order, round_number`,
    [leagues]
  );

  const { rows: entries } = await pool.query(
    `
    WITH latest_entries AS (
      SELECT DISTINCT ON (s.team_id, s.round_id)
        s.team_id, s.round_id, s.final_total, s.round_time_seconds
      FROM score_entries s
      JOIN rounds r ON r.id = s.round_id
      WHERE r.league = ANY($1)
      ORDER BY s.team_id, s.round_id,
        CASE WHEN r.allows_multiple_tries THEN s.final_total END DESC NULLS LAST,
        CASE WHEN r.allows_multiple_tries THEN COALESCE(s.round_time_seconds, 1e12) END ASC,
        s.updated_at DESC,
        s.id DESC
    ),
    round_best AS (
      SELECT round_id, MAX(final_total) AS best_score
      FROM latest_entries
      GROUP BY round_id
    )
    SELECT le.team_id, le.round_id, le.final_total AS raw_score, le.round_time_seconds,
           CASE WHEN rb.best_score > 0
                THEN ROUND((le.final_total / rb.best_score * 100)::numeric, 2)
                ELSE 0 END AS normalized_score
    FROM latest_entries le
    JOIN round_best rb ON rb.round_id = le.round_id
    `,
    [leagues]
  );

  const entryMap = new Map();
  for (const e of entries) entryMap.set(`${e.team_id}:${e.round_id}`, e);

  const roundsByLeague = new Map();
  for (const r of rounds) {
    if (!roundsByLeague.has(r.league)) roundsByLeague.set(r.league, []);
    roundsByLeague.get(r.league).push(r);
  }

  const result = teams.map((t) => {
    const teamRounds = roundsByLeague.get(t.league) || [];
    let total_normalized = 0;
    let total_time_seconds = 0;
    let rounds_played = 0;

    const roundResults = teamRounds.map((r) => {
      const e = entryMap.get(`${t.id}:${r.id}`);
      if (!e) {
        return {
          round_id: r.id,
          round_number: r.round_number,
          round_label: r.label,
          played: false,
          raw_score: null,
          normalized_score: 0,
          round_time_seconds: null,
        };
      }
      const normalized = Number(e.normalized_score);
      rounds_played += 1;
      total_normalized += normalized;
      total_time_seconds += Number(e.round_time_seconds) || 0;
      return {
        round_id: r.id,
        round_number: r.round_number,
        round_label: r.label,
        played: true,
        raw_score: e.raw_score,
        normalized_score: normalized,
        round_time_seconds: e.round_time_seconds,
      };
    });

    return {
      team_id: t.id,
      team_name: t.name,
      league: t.league,
      rounds: roundResults,
      total_rounds: teamRounds.length,
      rounds_played,
      total_normalized: Math.round(total_normalized * 100) / 100,
      total_time_seconds,
    };
  });

  result.sort((a, b) => (
    b.total_normalized - a.total_normalized
    || a.total_time_seconds - b.total_time_seconds
    || a.team_name.localeCompare(b.team_name, 'fa')
  ));

  return result;
}

module.exports = { listScores, leaderboard };
