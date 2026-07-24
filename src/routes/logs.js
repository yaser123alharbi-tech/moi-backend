const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('developer'));

router.get('/', async (req, res) => {
  const { date, user, action } = req.query;
  const clauses = [];
  const params = [];
  if (date) { params.push(date); clauses.push(`created_at::date = $${params.length}`); }
  if (user) { params.push(`%${user}%`); clauses.push(`actor_name ILIKE $${params.length}`); }
  if (action) { params.push(`%${action}%`); clauses.push(`action ILIKE $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 500`, params
  );
  res.json(rows);
});

router.get('/export.csv', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5000`);
  const header = 'date,actor,rank,action,old_data,new_data,ip\n';
  const csv = rows.map(r =>
    [r.created_at.toISOString(), r.actor_name, r.actor_rank, r.action,
     JSON.stringify(r.old_data || ''), JSON.stringify(r.new_data || ''), r.ip_address]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
  res.send(header + csv);
});

module.exports = router;
