const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  let query = `SELECT l.*, u.full_name FROM leave_requests l JOIN users u ON u.id = l.user_id`;
  const params = [];
  if (!['hr', 'high_command', 'unit_commander', 'developer'].includes(req.user.role)) {
    query += ` WHERE l.user_id = $1`;
    params.push(req.user.id);
  } else if (req.user.role === 'unit_commander') {
    query += ` WHERE u.unit_id = (SELECT unit_id FROM users WHERE id = $1)`;
    params.push(req.user.id);
  }
  query += ` ORDER BY l.created_at DESC`;
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { type_ar, type_en, fromDate, toDate, reason } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO leave_requests (user_id, type_ar, type_en, from_date, to_date, reason_ar, reason_en)
     VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,
    [req.user.id, type_ar, type_en, fromDate, toDate, reason]
  );
  await logAction(req, 'leave_request', null, rows[0]);
  res.status(201).json(rows[0]);
});

router.post('/:id/review', requireRole('hr', 'high_command', 'unit_commander'), async (req, res) => {
  const { status } = req.body; // approved | rejected
  const { rows } = await pool.query(
    `UPDATE leave_requests SET status=$1, reviewed_by=$2, reviewed_at=now() WHERE id=$3 RETURNING *`,
    [status, req.user.id, req.params.id]
  );
  if (status === 'approved' && rows[0]) {
    await pool.query(`UPDATE users SET status='leave' WHERE id=$1`, [rows[0].user_id]);
  }
  await logAction(req, `leave_${status}`, null, rows[0]);
  res.json(rows[0]);
});

module.exports = router;
