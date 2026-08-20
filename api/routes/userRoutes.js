const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { ROLES } = require('../constants');
const { requireRole } = require('../auth');

const router = express.Router();
router.use(requireRole('super_admin'));

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, display_name, role, created_at FROM users ORDER BY role, username'
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { username, password, display_name, role } = req.body || {};
  if (!username || !password || !ROLES.includes(role)) {
    return res.status(400).json({ error: 'نام کاربری، رمز عبور یا نقش نامعتبر است' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
  }
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4) RETURNING id, username, display_name, role, created_at`,
      [username.trim(), password_hash, display_name || null, role]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'این نام کاربری قبلاً استفاده شده است' });
    console.error('Create user failed:', err);
    res.status(500).json({ error: 'خطا در ایجاد کاربر' });
  }
});

router.put('/:id', async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'کاربر یافت نشد' });

  const { display_name, role, password } = req.body || {};
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'نقش نامعتبر است' });
  }
  // Guard against a Super Admin locking themselves out by demoting their own
  // last super_admin account.
  if (role && role !== 'super_admin' && existing.role === 'super_admin' && Number(req.params.id) === req.user.sub) {
    const { rows: otherSuperAdmins } = await pool.query(
      `SELECT id FROM users WHERE role = 'super_admin' AND id != $1`,
      [req.params.id]
    );
    if (otherSuperAdmins.length === 0) {
      return res.status(400).json({ error: 'نمی‌توانید تنها حساب مدیر کل را از این نقش خارج کنید' });
    }
  }

  try {
    let password_hash = existing.password_hash;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
      password_hash = await bcrypt.hash(password, 10);
    }
    const { rows } = await pool.query(
      `UPDATE users SET display_name=$1, role=$2, password_hash=$3 WHERE id=$4
       RETURNING id, username, display_name, role, created_at`,
      [display_name != null ? display_name : existing.display_name, role || existing.role, password_hash, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Update user failed:', err);
    res.status(500).json({ error: 'خطا در ویرایش کاربر' });
  }
});

router.delete('/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.sub) {
    return res.status(400).json({ error: 'نمی‌توانید حساب خودتان را حذف کنید' });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
