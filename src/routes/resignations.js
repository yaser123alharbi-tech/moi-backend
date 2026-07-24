const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  let query = `SELECT r.*, u.full_name FROM resignations r JOIN users u ON u.id = r.user_id`;
  const params = [];
  if (!['hr', 'high_command', 'developer'].includes(req.user.role)) {
    query += ` WHERE r.user_id = $1`;
    params.push(req.user.id);
  }
  query += ` ORDER BY r.created_at DESC`;
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { reason, attachments } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO resignations (user_id, reason, attachments) VALUES ($1,$2,$3) RETURNING *`,
    [req.user.id, reason, attachments]
  );
  await logAction(req, 'resignation_request', null, rows[0]);
  res.status(201).json(rows[0]);
});

router.post('/:id/review', requireRole('hr', 'high_command'), async (req, res) => {
  const { status } = req.body; // approved | rejected | suspended
  const { rows } = await pool.query(
    `UPDATE resignations SET status=$1, reviewed_by=$2, reviewed_at=now() WHERE id=$3 RETURNING *`,
    [status, req.user.id, req.params.id]
  );
  if (status === 'approved' && rows[0]) {
    await pool.query(`UPDATE users SET status='resigned' WHERE id=$1`, [rows[0].user_id]);
  }
  await logAction(req, `resignation_${status}`, null, rows[0]);
  res.json(rows[0]);
});

module.exports = router;
