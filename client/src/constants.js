// Mirrors api/constants.js — leagues are a small fixed pair (see the
// migration plan §3); kept as a plain constant on both sides rather than
// fetched from a /api/config endpoint, since it basically never changes.
export const LEAGUES = ['مقدماتی', 'پیشرفته'];

// Virtual league for the shared Superteam round (not a real team league).
export const SUPERTEAM_LEAGUE = 'سوپرتیم';

export const ROUND_LEAGUES = [...LEAGUES, SUPERTEAM_LEAGUE];

export const SUPERTEAM_MIN_MEMBERS = 2;
export const SUPERTEAM_MAX_MEMBERS = 3;
