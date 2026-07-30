/**
 * Imports the real LSPD roster (parsed from the uploaded schedule CSV) into
 * the database as actual personnel records.
 *
 * - Creates the units referenced in the sheet.
 * - Maps each rank group to a bilingual rank label + ladder position.
 * - Maps a handful of administrative titles (Chief of Police, Head of
 *   Internal Affairs, ...) to the system's permission roles, so the right
 *   people automatically get management access.
 * - Generates a login (username + temporary password) for every named
 *   officer so they can sign in; vacant badge slots (no name in the sheet)
 *   are stored as placeholder records with has_login = false and are hidden
 *   from login entirely — they only exist so the roster/badge numbers line
 *   up with the real schedule.
 *
 * Run once with: node src/import_lspd.js
 * Safe to re-run: it skips badges that already exist.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const ROSTER_PATH = path.join(__dirname, '..', 'data', 'lspd_roster.json');

// Bilingual rank ladder, in seniority order (index 0 = lowest)
const RANK_LADDER = [
  { key: 'Cadet',            ar: 'مجند',              en: 'Cadet' },
  { key: 'Officer One',      ar: 'شرطي',               en: 'Officer I' },
  { key: 'Officer Two',      ar: 'شرطي أول',            en: 'Officer II' },
  { key: 'Officer three',    ar: 'رقيب',               en: 'Officer III' },
  { key: 'Senior Officer',   ar: 'ضابط أول',            en: 'Senior Officer' },
  { key: 'Sergeant',         ar: 'عريف',               en: 'Sergeant' },
  { key: 'First Sergeant',   ar: 'عريف أول',            en: 'First Sergeant' },
  { key: 'Lieutenant',       ar: 'ملازم',              en: 'Lieutenant' },
  { key: 'First Lieutenant', ar: 'ملازم أول',           en: 'First Lieutenant' },
  { key: 'Captain',          ar: 'نقيب',               en: 'Captain' },
  { key: 'Major',            ar: 'رائد',               en: 'Major' },
  { key: 'Colonel',          ar: 'عقيد',               en: 'Colonel' },
  { key: 'Commander',        ar: 'عميد',               en: 'Commander' },
  { key: 'Chief Command',    ar: 'القيادة العليا',       en: 'Chief Command' },
];
const rankLookup = Object.fromEntries(RANK_LADDER.map((r, i) => [r.key, { ...r, position: i }]));

// Administrative titles -> system permission role (defaults to 'soldier')
const TITLE_ROLE_MAP = [
  { match: /chief of police/i, role: 'high_command' },
  { match: /assistant chief/i, role: 'high_command' },
  { match: /head of internal affairs/i, role: 'hr' },
  { match: /deputy of internal affairs/i, role: 'hr' },
  { match: /supervisor of\s*internal affairs/i, role: 'hr' },
  { match: /deputy police academy/i, role: 'recruiter' },
];
function roleForRecord(rec) {
  if (rec.rank_group === 'Commander') return 'unit_commander';
  for (const rule of TITLE_ROLE_MAP) {
    if (rule.match.test(rec.admin_title || '')) return rule.role;
  }
  return 'soldier';
}

function slugifyUsername(badge, existing) {
  let base = badge.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!base) base = 'officer';
  let candidate = base;
  let i = 1;
  while (existing.has(candidate)) { candidate = `${base}${i}`; i++; }
  existing.add(candidate);
  return candidate;
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('vacation')) return 'leave';
  if (s.includes('unactive') || s.includes('inactive')) return 'leave';
  return 'active';
}

async function ensureUnit(client, name_en, name_ar, cache) {
  if (cache.has(name_en)) return cache.get(name_en);
  const { rows } = await client.query(`SELECT id FROM units WHERE name_en = $1`, [name_en]);
  let id;
  if (rows[0]) {
    id = rows[0].id;
  } else {
    const r = await client.query(
      `INSERT INTO units (name_en, name_ar) VALUES ($1,$2) RETURNING id`, [name_en, name_ar]
    );
    id = r.rows[0].id;
  }
  cache.set(name_en, id);
  return id;
}

async function importRoster() {
  const records = JSON.parse(fs.readFileSync(ROSTER_PATH, 'utf8'));
  const client = await pool.connect();
  const unitCache = new Map();
  const usedUsernames = new Set();
  const { rows: existingUsers } = await client.query(`SELECT username FROM users`);
  existingUsers.forEach(u => usedUsernames.add(u.username));

  const credentialsIssued = [];
  let created = 0, skipped = 0;

  try {
    await client.query('BEGIN');

    const generalUnit = await ensureUnit(client, 'Los Santos Police Department', 'شرطة لوس سانتوس', unitCache);
    const idpaUnit = await ensureUnit(client, 'I.D - P.A', 'الإدارة - أكاديمية الشرطة', unitCache);

    for (const rec of records) {
      const { rows: dupe } = await client.query(`SELECT id FROM users WHERE military_number = $1`, [rec.badge]);
      if (dupe.length) { skipped++; continue; }

      const rankInfo = rankLookup[rec.rank_group] || rankLookup['Cadet'];
      const unitId = rec.division && rec.division.trim() === 'I.D - P.A' ? idpaUnit : generalUnit;
      const status = mapStatus(rec.status);
      const dutyNote = (rec.status && !['active'].includes(rec.status.toLowerCase())) ? rec.status : null;
      const hasName = !!rec.name;
      const role = hasName ? roleForRecord(rec) : 'soldier';

      let username = null, passwordHash = null, tempPassword = null;
      if (hasName) {
        username = slugifyUsername(rec.badge, usedUsernames);
        tempPassword = 'CC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        passwordHash = await bcrypt.hash(tempPassword, 10);
      } else {
        // vacant slot placeholder — no login, unique dummy username to satisfy schema
        username = 'vacant_' + rec.badge.toLowerCase().replace(/[^a-z0-9]/g, '');
        passwordHash = await bcrypt.hash(Math.random().toString(36), 10);
      }

      await client.query(
        `INSERT INTO users
          (username, password_hash, role, full_name, rank_ar, rank_en, unit_id, military_number,
           status, discord, discord_id, admin_title_ar, admin_title_en, duty_note, has_login)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          username, passwordHash, role,
          hasName ? rec.name : `(${rec.badge} - vacant)`,
          rankInfo.ar, rankInfo.en, unitId, rec.badge,
          status, rec.discord || null, rec.discord_id || null,
          rec.admin_title || null, rec.admin_title || null,
          dutyNote, hasName,
        ]
      );
      created++;
      if (hasName) credentialsIssued.push({ badge: rec.badge, name: rec.name, username, tempPassword, role });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`\nImport complete: ${created} records created, ${skipped} skipped (already existed).\n`);
  console.log('Generated login credentials (share securely, force password reset on first login):');
  console.log('badge\tname\t\tusername\ttemp_password\trole');
  credentialsIssued.forEach(c => console.log(`${c.badge}\t${c.name}\t${c.username}\t${c.tempPassword}\t${c.role}`));

  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'issued_credentials.csv'),
    'badge,name,username,temp_password,role\n' +
    credentialsIssued.map(c => `${c.badge},"${c.name}",${c.username},${c.tempPassword},${c.role}`).join('\n')
  );
  console.log('\nFull list also saved to data/issued_credentials.csv');
  await pool.end();
}

importRoster().catch(err => { console.error('Import failed:', err); process.exit(1); });
