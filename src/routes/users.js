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
const SELECT_FIELDS = `id, username, role, full_name, rank_ar, rank_en, unit_id, military_number,
      join_date, last_promotion, promotions_count, status, discord, discord_id, steam_id, fivem_identifier,
      admin_title_ar, admin_title_en, duty_note, has_login`;

router.get('/', async (req, res) => {
  let query = `SELECT ${SELECT_FIELDS} FROM users`;
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
    `SELECT ${SELECT_FIELDS} FROM users WHERE id = $1`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// ---------------------------------------------------------------------------
// Edit OFFICIAL record fields (name, rank, unit, badge number, admin title).
// Restricted to officers/high command. Unit commanders may only edit
// personnel currently inside their own unit.
// ---------------------------------------------------------------------------
router.patch('/:id', requireRole('recruiter', 'hr', 'unit_commander', 'high_command'), async (req, res) => {
  const { rows: target } = await pool.query(`SELECT unit_id FROM users WHERE id = $1`, [req.params.id]);
  if (!target[0]) return res.status(404).json({ error: 'Not found' });

  if (req.user.role === 'unit_commander') {
    const { rows: me } = await pool.query(`SELECT unit_id FROM users WHERE id = $1`, [req.user.id]);
    if (!me[0] || me[0].unit_id !== target[0].unit_id) {
      return res.status(403).json({ error: 'You can only edit personnel in your own unit' });
    }
  }

  const { fullName, rank_ar, rank_en, unitId, militaryNumber, adminTitleAr, adminTitleEn } = req.body;
  const { rows: before } = await pool.query(`SELECT full_name, rank_ar, rank_en, unit_id, military_number FROM users WHERE id=$1`, [req.params.id]);

  const { rows } = await pool.query(
    `UPDATE users SET
        full_name = COALESCE($1, full_name),
        rank_ar = COALESCE($2, rank_ar),
        rank_en = COALESCE($3, rank_en),
        unit_id = COALESCE($4, unit_id),
        military_number = COALESCE($5, military_number),
        admin_title_ar = COALESCE($6, admin_title_ar),
        admin_title_en = COALESCE($7, admin_title_en),
        updated_at = now()
     WHERE id = $8
     RETURNING ${SELECT_FIELDS}`,
    [fullName, rank_ar, rank_en, unitId, militaryNumber, adminTitleAr, adminTitleEn, req.params.id]
  );
  await logAction(req, 'member_edited', before[0], rows[0]);
  res.json(rows[0]);
});

// ---------------------------------------------------------------------------
// Edit CONTACT fields — self-service only. Anyone logged in can update their
// own Discord/Steam/FiveM info, but not anyone else's.
// ---------------------------------------------------------------------------
router.patch('/:id/contact', async (req, res) => {
  if (req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'You can only edit your own contact details' });
  }
  const { discord, discordId, steamId, fivemIdentifier } = req.body;
  const { rows } = await pool.query(
    `UPDATE users SET discord=COALESCE($1,discord), discord_id=COALESCE($2,discord_id),
                       steam_id=COALESCE($3,steam_id), fivem_identifier=COALESCE($4,fivem_identifier),
                       updated_at=now()
     WHERE id=$5 RETURNING ${SELECT_FIELDS}`,
    [discord, discordId, steamId, fivemIdentifier, req.params.id]
  );
  await logAction(req, 'contact_updated', null, { discord, discordId });
  res.json(rows[0]);
});

// ---------------------------------------------------------------------------
// Assign a system permission role (soldier/recruiter/hr/badges_admin/
// unit_commander/high_command/developer). High command and developer only.
// ---------------------------------------------------------------------------
const VALID_ROLES = ['soldier', 'recruiter', 'hr', 'badges_admin', 'unit_commander', 'high_command', 'developer'];
router.patch('/:id/role', requireRole('high_command', 'developer'), async (req, res) => {
  const { role } = req.body;
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const { rows: before } = await pool.query(`SELECT role FROM users WHERE id=$1`, [req.params.id]);
  if (!before[0]) return res.status(404).json({ error: 'Not found' });
  const { rows } = await pool.query(
    `UPDATE users SET role=$1, updated_at=now() WHERE id=$2 RETURNING ${SELECT_FIELDS}`,
    [role, req.params.id]
  );
  await logAction(req, 'role_assigned', before[0], { role });
  res.json(rows[0]);
});

// ---------------------------------------------------------------------------
// Provision real login access for a vacant roster slot (badge with no
// account yet). HR / high command only.
// ---------------------------------------------------------------------------
router.post('/:id/provision-access', requireRole('hr', 'high_command'), async (req, res) => {
  const { username, password, fullName } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `UPDATE users SET username=$1, password_hash=$2, has_login=true, full_name=COALESCE($3, full_name), updated_at=now()
     WHERE id=$4 RETURNING ${SELECT_FIELDS}`,
    [username, hash, fullName, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await logAction(req, 'access_provisioned', null, { username });
  res.json(rows[0]);
});

router.post('/', requireRole(...MANAGE_ROLES), async (req, res) => {
  const { username, password, fullName, rank_ar, rank_en, unitId, militaryNumber, discord, discordId, steamId, fivemIdentifier } = req.body;
  const hash = await bcrypt.hash(password || '123456', 10);
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, role, full_name, rank_ar, rank_en, unit_id, military_number, discord, discord_id, steam_id, fivem_identifier, has_login)
     VALUES ($1,$2,'soldier',$3,$4,$5,$6,$7,$8,$9,$10,$11,true) RETURNING id, username, full_name`,
    [username, hash, fullName, rank_ar, rank_en, unitId, militaryNumber, discord, discordId, steamId, fivemIdentifier]
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

router.get('/:id/promotions', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM promotions WHERE user_id = $1 ORDER BY promoted_at DESC`, [req.params.id]);
  res.json(rows);
});

router.get('/:id/penalties', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM penalties WHERE user_id = $1 ORDER BY issued_at DESC`, [req.params.id]);
  res.json(rows);
});

module.exports = router;

