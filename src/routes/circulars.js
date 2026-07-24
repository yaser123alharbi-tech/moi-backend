const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows: me } = await pool.query(`SELECT unit_id FROM users WHERE id=$1`, [req.user.id]);
  const myUnit = me[0]?.unit_id;
  const { rows } = await pool.query(
    `SELECT * FROM circulars WHERE type='general' OR unit_id = $1 ORDER BY published_at DESC`,
    [myUnit]
  );
  res.json(rows);
});

router.post('/', requireRole('hr', 'high_command', 'unit_commander'), async (req, res) => {
  const { title_ar, title_en, body_ar, body_en, type, unitId, priority } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO circulars (title_ar, title_en, body_ar, body_en, type, unit_id, priority, published_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [title_ar, title_en, body_ar, body_en, type, type === 'unit' ? unitId : null, priority, req.user.id]
  );
  await logAction(req, 'circular_created', null, rows[0]);
  res.status(201).json(rows[0]);
});

module.exports = router;
