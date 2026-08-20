// Leagues stay a fixed, hardcoded pair per the migration plan (§3) — adding a
// third sub-league later is a small code change (add a value here + a small
// migration), not a data-model rework. Kept in one place and re-exported so
// routes/validation never have to repeat the literal strings.
const LEAGUES = ['مقدماتی', 'پیشرفته'];

const ROLES = ['admin', 'super_admin'];

const RULE_ITEM_TYPES = ['binary', 'multi', 'choice', 'scale', 'counter'];

module.exports = { LEAGUES, ROLES, RULE_ITEM_TYPES };
