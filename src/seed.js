require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Units
    const units = [
      ['Patrol Division', 'دورية العاصمة'],
      ['Traffic Division', 'إدارة المرور'],
      ['Criminal Investigation Dept.', 'المباحث الجنائية'],
      ['SWAT', 'الوحدة الخاصة SWAT'],
      ['Training Academy', 'أكاديمية التدريب'],
    ];
    const unitIds = [];
    for (const [en, ar] of units) {
      const r = await client.query(
        `INSERT INTO units (name_en, name_ar) VALUES ($1,$2) RETURNING id`,
        [en, ar]
      );
      unitIds.push(r.rows[0].id);
    }

    // Demo users (username / password shown at the end)
    const demoUsers = [
      { u: 'admin', p: 'admin123', role: 'developer', name: 'Root Access', rank_ar: 'مطوّر النظام', rank_en: 'System Developer', mil: '0001' },
      { u: 'highcmd', p: 'highcmd123', role: 'high_command', name: 'Khalid Al-Mansoori', rank_ar: 'اللواء', rank_en: 'Major General', mil: '0002' },
      { u: 'hr', p: 'hr123', role: 'hr', name: 'Fahad Al-Otaibi', rank_ar: 'عقيد', rank_en: 'Colonel', mil: '0003' },
      { u: 'recruiter', p: 'rec123', role: 'recruiter', name: 'Sara Al-Harbi', rank_ar: 'نقيب', rank_en: 'Captain', mil: '0004' },
      { u: 'badges', p: 'badge123', role: 'badges_admin', name: 'Omar Al-Qahtani', rank_ar: 'رائد', rank_en: 'Major', mil: '0005' },
      { u: 'commander', p: 'cmd123', role: 'unit_commander', name: 'Yousef Al-Dosari', rank_ar: 'مقدم', rank_en: 'Lt. Colonel', mil: '0006', unit: unitIds[3] },
      { u: 'soldier', p: 'sol123', role: 'soldier', name: 'Ahmed Al-Zahrani', rank_ar: 'جندي', rank_en: 'Private', mil: '0007', unit: unitIds[0] },
    ];

    for (const usr of demoUsers) {
      const hash = await bcrypt.hash(usr.p, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, role, full_name, rank_ar, rank_en, unit_id, military_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [usr.u, hash, usr.role, usr.name, usr.rank_ar, usr.rank_en, usr.unit || unitIds[0], usr.mil]
      );
    }

    // Badges
    const badges = [
      ['Wing Marksman', 'قناص متمرس', '🎯'],
      ['Wing SWAT', 'فريق سوات', '🛡️'],
      ['Wing Instructor', 'مدرب معتمد', '📘'],
    ];
    for (const [en, ar, icon] of badges) {
      await client.query(`INSERT INTO badges (name_en, name_ar, icon) VALUES ($1,$2,$3)`, [en, ar, icon]);
    }

    await client.query('COMMIT');
    console.log('Seed complete. Demo logins:');
    demoUsers.forEach((u) => console.log(`  ${u.u} / ${u.p}  (${u.role})`));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
