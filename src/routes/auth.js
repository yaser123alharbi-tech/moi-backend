const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const { rows } = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.has_login === false) return res.status(403).json({ error: 'No account has been provisioned for this record yet' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status === 'terminated') return res.status(403).json({ error: 'Account deactivated' });

  const token = jwt.sign(
    { id: user.id, role: user.role, fullName: user.full_name, rank: user.rank_en },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  req.user = { id: user.id, role: user.role, fullName: user.full_name, rank: user.rank_en };
  await logAction(req, 'login', null, null);

  delete user.password_hash;
  res.json({ token, user });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, username, role, full_name, rank_ar, rank_en, unit_id, military_number, status FROM users WHERE id = $1`, [req.user.id]);
  res.json(rows[0] || null);
});

router.post('/logout', requireAuth, async (req, res) => {
  await logAction(req, 'logout', null, null);
  res.json({ ok: true });
});

module.exports = router;
