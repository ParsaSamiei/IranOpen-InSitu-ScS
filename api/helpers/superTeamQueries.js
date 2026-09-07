const { pool } = require('../db');
const {
  SUPERTEAM_LEAGUE,
  SUPERTEAM_MIN_MEMBERS,
  SUPERTEAM_MAX_MEMBERS,
} = require('../constants');

function formatSuperTeamName(members) {
  return (members || []).map((m) => m.team_name).filter(Boolean).join(' + ');
}

async function loadSuperTeamMembers(superTeamIds) {
  if (!superTeamIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT stm.super_team_id, stm.team_id, stm.sort_order,
            t.name AS team_name, t.league
     FROM super_team_members stm
     JOIN teams t ON t.id = stm.team_id
     WHERE stm.super_team_id = ANY($1)
     ORDER BY stm.sort_order, t.name`,
    [superTeamIds]
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.super_team_id)) map.set(row.super_team_id, []);
    map.get(row.super_team_id).push({
      team_id: row.team_id,
      team_name: row.team_name,
      league: row.league,
      sort_order: row.sort_order,
    });
  }
  return map;
}

async function listSuperTeams() {
  const { rows: teams } = await pool.query(
    `SELECT id, created_at FROM super_teams ORDER BY id`
  );
  const membersById = await loadSuperTeamMembers(teams.map((t) => t.id));
  return teams.map((st) => {
    const members = membersById.get(st.id) || [];
    return {
      id: st.id,
      created_at: st.created_at,
      name: formatSuperTeamName(members),
      members,
      member_count: members.length,
    };
  });
}

async function getSuperTeam(id) {
  const { rows } = await pool.query(
    `SELECT id, created_at FROM super_teams WHERE id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const membersById = await loadSuperTeamMembers([rows[0].id]);
  const members = membersById.get(rows[0].id) || [];
  return {
    id: rows[0].id,
    created_at: rows[0].created_at,
    name: formatSuperTeamName(members),
    members,
    member_count: members.length,
  };
}

function validateMemberIds(teamIds) {
  if (!Array.isArray(teamIds)) {
    return { error: 'فهرست تیم‌های عضو نامعتبر است' };
  }
  const ids = [...new Set(teamIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length < SUPERTEAM_MIN_MEMBERS || ids.length > SUPERTEAM_MAX_MEMBERS) {
    return {
      error: `هر سوپرتیم باید ${SUPERTEAM_MIN_MEMBERS} یا ${SUPERTEAM_MAX_MEMBERS} تیم داشته باشد`,
    };
  }
  return { ids };
}

async function createSuperTeam(teamIds) {
  const parsed = validateMemberIds(teamIds);
  if (parsed.error) {
    const err = new Error(parsed.error);
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: teamRows } = await client.query(
      `SELECT id FROM teams WHERE id = ANY($1)`,
      [parsed.ids]
    );
    if (teamRows.length !== parsed.ids.length) {
      const err = new Error('یکی از تیم‌های انتخاب‌شده یافت نشد');
      err.status = 400;
      throw err;
    }

    const { rows: taken } = await client.query(
      `SELECT team_id FROM super_team_members WHERE team_id = ANY($1)`,
      [parsed.ids]
    );
    if (taken.length > 0) {
      const err = new Error('یکی از تیم‌ها از قبل در سوپرتیم دیگری عضو است');
      err.status = 400;
      throw err;
    }

    const { rows: created } = await client.query(
      `INSERT INTO super_teams DEFAULT VALUES RETURNING id, created_at`
    );
    const superTeamId = created[0].id;

    for (let i = 0; i < parsed.ids.length; i += 1) {
      await client.query(
        `INSERT INTO super_team_members (super_team_id, team_id, sort_order)
         VALUES ($1, $2, $3)`,
        [superTeamId, parsed.ids[i], i]
      );
    }

    await client.query('COMMIT');
    return getSuperTeam(superTeamId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateSuperTeamMembers(superTeamId, teamIds) {
  const parsed = validateMemberIds(teamIds);
  if (parsed.error) {
    const err = new Error(parsed.error);
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT id FROM super_teams WHERE id = $1`,
      [superTeamId]
    );
    if (!existing[0]) {
      const err = new Error('سوپرتیم یافت نشد');
      err.status = 404;
      throw err;
    }

    const { rows: teamRows } = await client.query(
      `SELECT id FROM teams WHERE id = ANY($1)`,
      [parsed.ids]
    );
    if (teamRows.length !== parsed.ids.length) {
      const err = new Error('یکی از تیم‌های انتخاب‌شده یافت نشد');
      err.status = 400;
      throw err;
    }

    const { rows: taken } = await client.query(
      `SELECT team_id FROM super_team_members
       WHERE team_id = ANY($1) AND super_team_id <> $2`,
      [parsed.ids, superTeamId]
    );
    if (taken.length > 0) {
      const err = new Error('یکی از تیم‌ها از قبل در سوپرتیم دیگری عضو است');
      err.status = 400;
      throw err;
    }

    await client.query(
      `DELETE FROM super_team_members WHERE super_team_id = $1`,
      [superTeamId]
    );
    for (let i = 0; i < parsed.ids.length; i += 1) {
      await client.query(
        `INSERT INTO super_team_members (super_team_id, team_id, sort_order)
         VALUES ($1, $2, $3)`,
        [superTeamId, parsed.ids[i], i]
      );
    }

    await client.query('COMMIT');
    return getSuperTeam(superTeamId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteSuperTeam(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM super_teams WHERE id = $1`,
    [id]
  );
  return rowCount > 0;
}

// Separate Superteam standings: one collab scoresheet per Superteam, ranked
// by that score (raw total). Ties broken by round time, then display name.
async function superTeamLeaderboard({ forPublic = false } = {}) {
  const superTeams = await listSuperTeams();
  if (superTeams.length === 0) return [];

  const { rows: rounds } = await pool.query(
    `SELECT id, round_number, label, scores_visible, allows_multiple_tries
     FROM rounds
     WHERE is_superteam = true OR league = $1
     ORDER BY sort_order, round_number`,
    [SUPERTEAM_LEAGUE]
  );

  if (rounds.length === 0) {
    return superTeams.map((st) => ({
      super_team_id: st.id,
      super_team_name: st.name,
      members: st.members,
      played: false,
      scores_hidden: false,
      raw_score: null,
      round_time_seconds: null,
      round_id: null,
      round_label: null,
    })).sort((a, b) => a.super_team_name.localeCompare(b.super_team_name, 'fa'));
  }

  // Product decision: one Superteam round. Use the first (by sort) if several exist.
  const round = rounds[0];
  const scoresVisible = round.scores_visible !== false;
  const hideScores = forPublic && !scoresVisible;

  const { rows: entries } = await pool.query(
    `
    SELECT DISTINCT ON (s.super_team_id)
      s.super_team_id, s.final_total, s.round_time_seconds, s.round_id
    FROM score_entries s
    WHERE s.round_id = $1 AND s.super_team_id IS NOT NULL
    ORDER BY s.super_team_id,
      CASE WHEN $2 THEN s.final_total END DESC NULLS LAST,
      CASE WHEN $2 THEN COALESCE(s.round_time_seconds, 1e12) END ASC,
      s.updated_at DESC,
      s.id DESC
    `,
    [round.id, !!round.allows_multiple_tries]
  );

  const entryMap = new Map(entries.map((e) => [e.super_team_id, e]));

  const result = superTeams.map((st) => {
    if (hideScores) {
      return {
        super_team_id: st.id,
        super_team_name: st.name,
        members: st.members,
        played: false,
        scores_hidden: true,
        raw_score: null,
        round_time_seconds: null,
        round_id: round.id,
        round_label: round.label || `راند ${round.round_number}`,
      };
    }

    const e = entryMap.get(st.id);
    if (!e) {
      return {
        super_team_id: st.id,
        super_team_name: st.name,
        members: st.members,
        played: false,
        scores_hidden: false,
        raw_score: null,
        round_time_seconds: null,
        round_id: round.id,
        round_label: round.label || `راند ${round.round_number}`,
      };
    }

    return {
      super_team_id: st.id,
      super_team_name: st.name,
      members: st.members,
      played: true,
      scores_hidden: false,
      raw_score: e.final_total,
      round_time_seconds: e.round_time_seconds,
      round_id: round.id,
      round_label: round.label || `راند ${round.round_number}`,
    };
  });

  result.sort((a, b) => {
    if (a.scores_hidden || b.scores_hidden) {
      return a.super_team_name.localeCompare(b.super_team_name, 'fa');
    }
    const aScore = a.played ? Number(a.raw_score) : -Infinity;
    const bScore = b.played ? Number(b.raw_score) : -Infinity;
    if (bScore !== aScore) return bScore - aScore;
    const aTime = a.played ? (Number(a.round_time_seconds) || 0) : Infinity;
    const bTime = b.played ? (Number(b.round_time_seconds) || 0) : Infinity;
    if (aTime !== bTime) return aTime - bTime;
    return a.super_team_name.localeCompare(b.super_team_name, 'fa');
  });

  return result;
}

module.exports = {
  formatSuperTeamName,
  loadSuperTeamMembers,
  listSuperTeams,
  getSuperTeam,
  createSuperTeam,
  updateSuperTeamMembers,
  deleteSuperTeam,
  superTeamLeaderboard,
  validateMemberIds,
};
