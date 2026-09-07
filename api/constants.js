// Leagues stay a fixed, hardcoded pair per the migration plan (§3) — adding a
// third sub-league later is a small code change (add a value here + a small
// migration), not a data-model rework. Kept in one place and re-exported so
// routes/validation never have to repeat the literal strings.
const LEAGUES = ['مقدماتی', 'پیشرفته'];

// Virtual league bucket used only for the shared Superteam round (teams from
// any real league can be paired). Never assigned to rows in `teams`.
const SUPERTEAM_LEAGUE = 'سوپرتیم';

const ROUND_LEAGUES = [...LEAGUES, SUPERTEAM_LEAGUE];

const ROLES = ['admin', 'super_admin'];

const RULE_ITEM_TYPES = ['binary', 'multi', 'choice', 'scale', 'counter'];

const SUPERTEAM_MIN_MEMBERS = 2;
const SUPERTEAM_MAX_MEMBERS = 3;

module.exports = {
  LEAGUES,
  SUPERTEAM_LEAGUE,
  ROUND_LEAGUES,
  ROLES,
  RULE_ITEM_TYPES,
  SUPERTEAM_MIN_MEMBERS,
  SUPERTEAM_MAX_MEMBERS,
};
