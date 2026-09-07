const express = require('express');
const { requireRole } = require('../auth');
const {
  listSuperTeams,
  getSuperTeam,
  createSuperTeam,
  updateSuperTeamMembers,
  deleteSuperTeam,
  superTeamLeaderboard,
} = require('../helpers/superTeamQueries');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json(await listSuperTeams());
  } catch (err) {
    console.error('List super teams failed:', err);
    res.status(500).json({ error: 'خطا در بارگذاری سوپرتیم‌ها' });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    res.json(await superTeamLeaderboard());
  } catch (err) {
    console.error('Super team leaderboard failed:', err);
    res.status(500).json({ error: 'خطا در بارگذاری رده‌بندی سوپرتیم' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const st = await getSuperTeam(Number(req.params.id));
    if (!st) return res.status(404).json({ error: 'سوپرتیم یافت نشد' });
    res.json(st);
  } catch (err) {
    console.error('Get super team failed:', err);
    res.status(500).json({ error: 'خطا در بارگذاری سوپرتیم' });
  }
});

router.post('/', requireRole('super_admin'), async (req, res) => {
  try {
    const st = await createSuperTeam(req.body?.team_ids);
    res.json(st);
  } catch (err) {
    console.error('Create super team failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'خطا در ایجاد سوپرتیم' });
  }
});

router.put('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const st = await updateSuperTeamMembers(Number(req.params.id), req.body?.team_ids);
    res.json(st);
  } catch (err) {
    console.error('Update super team failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'خطا در ویرایش سوپرتیم' });
  }
});

router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const ok = await deleteSuperTeam(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'سوپرتیم یافت نشد' });
    res.json({ ok: true });
  } catch (err) {
    // ON DELETE RESTRICT wouldn't apply (scores CASCADE), but keep a safe message.
    if (err.code === '23503') {
      return res.status(400).json({
        error: 'این سوپرتیم دارای امتیاز ثبت‌شده است و فعلاً قابل حذف نیست.',
      });
    }
    console.error('Delete super team failed:', err);
    res.status(500).json({ error: 'خطا در حذف سوپرتیم' });
  }
});

module.exports = router;
