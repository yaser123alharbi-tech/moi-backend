const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

const MANAGE_ROLES = ['recruiter', 'hr', 'high_command', 'unit_commander'];

// List personnel (scoped: unit_commander only sees their unit, handled client-side too,
// but we enforce it here for real security)
router.get('/', async (req, res) => {
  let query = `SELECT id, username, role, full_name, rank_ar, rank_en, unit_id, military_number,
                      join_date, last_promotion, promotions_count, status, discord, steam_id, fivem_identifier
               FROM users`;
  const params = [];
  if (req.user.role === 'unit_commander') {
    query += ` WHERE unit_id = (SELECT unit_id FROM users WHERE id = $1)`;
    params.push(req.user.id);
  }
  query += ` ORDER BY join_date DESC`;
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, username, role, full_name, rank_ar, rank_en, unit_id, military_number,
            join_date, last_promotion, promotions_count, status, discord, steam_id, fivem_identifier
     FROM users WHERE id = $1`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/', requireRole(...MANAGE_ROLES), async (req, res) => {
  const { username, password, fullName, rank_ar, rank_en, unitId, militaryNumber, discord, steamId, fivemIdentifier } = req.body;
  const hash = await bcrypt.hash(password || '123456', 10);
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, role, full_name, rank_ar, rank_en, unit_id, military_number, discord, steam_id, fivem_identifier)
     VALUES ($1,$2,'soldier',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, username, full_name`,
    [username, hash, fullName, rank_ar, rank_en, unitId, militaryNumber, discord, steamId, fivemIdentifier]
  );
  await logAction(req, 'hire_member', null, rows[0]);
  res.status(201).json(rows[0]);
});

router.post('/:id/promote', requireRole('hr', 'high_command', 'unit_commander'), async (req, res) => {
  const { rank_ar, rank_en, reason } = req.body;
  const { rows: cur } = await pool.query(`SELECT rank_ar, rank_en FROM users WHERE id = $1`, [req.params.id]);
  if (!cur[0]) return res.status(404).json({ error: 'Not found' });

  await pool.query(
    `UPDATE users SET rank_ar=$1, rank_en=$2, last_promotion=CURRENT_DATE, promotions_count = promotions_count + 1, updated_at=now() WHERE id=$3`,
    [rank_ar, rank_en, req.params.id]
  );
  await pool.query(
    `INSERT INTO promotions (user_id, from_rank_ar, from_rank_en, to_rank_ar, to_rank_en, reason_ar, reason_en, promoted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7)`,
    [req.params.id, cur[0].rank_ar, cur[0].rank_en, rank_ar, rank_en, reason, req.user.id]
  );
  await logAction(req, 'promotion', cur[0], { rank_ar, rank_en });
  res.json({ ok: true });
});

router.post('/:id/penalty', requireRole('hr', 'high_command', 'unit_commander'), async (req, res) => {
  const { type_ar, type_en, reason } = req.body;
  await pool.query(
    `INSERT INTO penalties (user_id, type_ar, type_en, reason_ar, reason_en, issued_by) VALUES ($1,$2,$3,$4,$4,$5)`,
    [req.params.id, type_ar, type_en, reason, req.user.id]
  );
  await logAction(req, 'penalty_added', null, { type_ar, reason });
  res.json({ ok: true });
});

router.post('/:id/transfer', requireRole('high_command'), async (req, res) => {
  const { unitId } = req.body;
  const { rows: cur } = await pool.query(`SELECT unit_id FROM users WHERE id=$1`, [req.params.id]);
  await pool.query(`UPDATE users SET unit_id=$1, updated_at=now() WHERE id=$2`, [unitId, req.params.id]);
  await logAction(req, 'unit_transfer', cur[0], { unitId });
  res.json({ ok: true });
});

router.post('/:id/terminate', requireRole('high_command'), async (req, res) => {
  await pool.query(`UPDATE users SET status='terminated', updated_at=now() WHERE id=$1`, [req.params.id]);
  await logAction(req, 'termination', null, { id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
