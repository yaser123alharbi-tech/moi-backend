const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.*, (SELECT count(*) FROM users x WHERE x.unit_id = u.id AND x.status <> 'resigned') AS member_count
    FROM units u ORDER BY u.name_en`);
  res.json(rows);
});

router.post('/', requireRole('high_command'), async (req, res) => {
  const { name_ar, name_en } = req.body;
  const { rows } = await pool.query(`INSERT INTO units (name_ar, name_en) VALUES ($1,$2) RETURNING *`, [name_ar, name_en]);
  await logAction(req, 'unit_created', null, rows[0]);
  res.status(201).json(rows[0]);
});

router.put('/:id', requireRole('high_command'), async (req, res) => {
  const { name_ar, name_en, commanderId, deputyId } = req.body;
  const { rows } = await pool.query(
    `UPDATE units SET name_ar=$1, name_en=$2, commander_id=$3, deputy_id=$4, updated_at=now() WHERE id=$5 RETURNING *`,
    [name_ar, name_en, commanderId, deputyId, req.params.id]
  );
  await logAction(req, 'unit_updated', null, rows[0]);
  res.json(rows[0]);
});

module.exports = router;
