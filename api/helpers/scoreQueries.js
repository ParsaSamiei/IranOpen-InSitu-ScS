const { pool } = require('../db');

// Shared by /api/scores (admin, includeJudge=true) and /api/public/history
// (includeJudge=false, per the migration plan's public-sanitization rule).
async function listScores({ team_id, round_id, league, includeJudge }) {
  let sql = `
    SELECT s.id, s.team_id, t.name AS team_name, t.league,
           s.round_id, r.round_number, r.label AS round_label,
           s.values_json, s.section_totals_json, s.final_total,
           s.round_time_seconds, s.captain_name, s.captain_signature,
           s.created_at, s.updated_at
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
  }));
}

// Best round per team (by final_total, tie-broken by lower time), same logic
// as the original single-league version — league filtering now goes through
// teams.league instead of a league column on score_entries directly.
async function leaderboard({ league }) {
  let sql = `
    WITH best_rounds AS (
      SELECT DISTINCT ON (s.team_id)
        s.team_id, s.final_total, s.round_time_seconds
      FROM score_entries s
      ORDER BY s.team_id, s.final_total DESC, s.round_time_seconds ASC NULLS LAST, s.id ASC
    )
    SELECT t.id AS team_id, t.name AS team_name, t.league,
           br.final_total AS best_score,
           br.round_time_seconds AS best_time_seconds,
           COUNT(s.id) AS rounds_played
    FROM teams t
    LEFT JOIN best_rounds br ON br.team_id = t.id
    LEFT JOIN score_entries s ON s.team_id = t.id
  `;
  const params = [];
  if (league) { params.push(league); sql += ` WHERE t.league = $${params.length}`; }
  sql += `
    GROUP BY t.id, t.name, t.league, br.final_total, br.round_time_seconds
    ORDER BY (br.final_total IS NULL), br.final_total DESC NULLS LAST, br.round_time_seconds ASC NULLS LAST, t.name ASC
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

module.exports = { listScores, leaderboard };
