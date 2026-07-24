const pool = require('../db');

async function logAction(req, action, oldData, newData) {
  const actor = req.user || {};
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
  await pool.query(
    `INSERT INTO audit_logs (actor_id, actor_name, actor_rank, action, old_data, new_data, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actor.id || null, actor.fullName || 'system', actor.rank || '-', action,
     JSON.stringify(oldData ?? null), JSON.stringify(newData ?? null), ip.split(',')[0].trim() || null]
  );
}

module.exports = { logAction };
