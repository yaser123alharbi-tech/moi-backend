const express = require('express');
const pool = require('../db');

const router = express.Router();

// Public personnel directory — anyone can view. No sensitive fields exposed
// (no discord id, no steam/fivem identifiers, no username).
router.get('/roster', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.full_name, u.rank_ar, u.rank_en, u.military_number, u.status,
           u.admin_title_ar, u.admin_title_en, u.has_login,
           un.name_ar AS unit_name_ar, un.name_en AS unit_name_en
    FROM users u
    LEFT JOIN units un ON un.id = u.unit_id
    WHERE u.status <> 'terminated'
    ORDER BY u.military_number
  `);
  res.json(rows);
});

router.get('/units', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT un.id, un.name_ar, un.name_en,
           (SELECT count(*) FROM users x WHERE x.unit_id = un.id AND x.status <> 'resigned') AS member_count
    FROM units un ORDER BY un.name_en
  `);
  res.json(rows);
});

router.get('/circulars', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM circulars WHERE type = 'general' ORDER BY published_at DESC LIMIT 20`);
  res.json(rows);
});

module.exports = router;
