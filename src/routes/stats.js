const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const totalPersonnel = await pool.query(`SELECT count(*)::int AS n FROM users WHERE status <> 'resigned' AND status <> 'terminated' AND has_login = true`);
  const officers = await pool.query(`SELECT count(*)::int AS n FROM users WHERE role <> 'soldier' AND status <> 'resigned' AND status <> 'terminated' AND has_login = true`);
  const activeLeaves = await pool.query(`SELECT count(*)::int AS n FROM leave_requests WHERE status = 'approved'`);
  const resignCount = await pool.query(`SELECT count(*)::int AS n FROM resignations`);
  const promosMonth = await pool.query(`SELECT count(*)::int AS n FROM promotions WHERE date_trunc('month', promoted_at) = date_trunc('month', now())`);
  const hiresMonth = await pool.query(`SELECT count(*)::int AS n FROM users WHERE date_trunc('month', join_date) = date_trunc('month', now())`);
  const unitDist = await pool.query(`
    SELECT un.name_ar, un.name_en,
           (SELECT count(*)::int FROM users x WHERE x.unit_id = un.id AND x.status NOT IN ('resigned','terminated') AND x.has_login = true) AS count
    FROM units un ORDER BY un.name_en
  `);
  const recentCirculars = await pool.query(`SELECT * FROM circulars WHERE type = 'general' ORDER BY published_at DESC LIMIT 5`);

  const payload = {
    totalPersonnel: totalPersonnel.rows[0].n,
    officers: officers.rows[0].n,
    activeLeaves: activeLeaves.rows[0].n,
    resignCount: resignCount.rows[0].n,
    promosMonth: promosMonth.rows[0].n,
    hiresMonth: hiresMonth.rows[0].n,
    unitDistribution: unitDist.rows,
    recentCirculars: recentCirculars.rows,
  };

  if (req.user.role === 'developer') {
    const recentOps = await pool.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8`);
    payload.recentOps = recentOps.rows;
  }

  res.json(payload);
});

module.exports = router;
