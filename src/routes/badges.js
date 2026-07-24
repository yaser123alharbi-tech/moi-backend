const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM badges ORDER BY created_at`);
  res.json(rows);
});

router.post('/', requireRole('badges_admin', 'high_command'), async (req, res) => {
  const { name_ar, name_en, desc_ar, desc_en, icon } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO badges (name_ar, name_en, desc_ar, desc_en, icon, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name_ar, name_en, desc_ar, desc_en, icon, req.user.id]
  );
  await logAction(req, 'badge_created', null, rows[0]);
  res.status(201).json(rows[0]);
});

router.post('/:id/award', requireRole('badges_admin', 'high_command'), async (req, res) => {
  const { userId } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO user_badges (user_id, badge_id, awarded_by) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, badge_id) DO NOTHING RETURNING *`,
    [userId, req.params.id, req.user.id]
  );
  await logAction(req, 'badge_awarded', null, { userId, badgeId: req.params.id });
  res.status(201).json(rows[0] || { alreadyAwarded: true });
});

router.get('/user/:userId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, ub.awarded_at FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = $1`,
    [req.params.userId]
  );
  res.json(rows);
});

module.exports = router;
