/**
 * Seeds a starter set of LSPD wings/badges. Safe to re-run (skips ones that
 * already exist by English name). Run this once after import_lspd.js:
 *
 *   node src/seed_badges.js
 */
require('dotenv').config();
const pool = require('./db');

const BADGES = [
  { name_en: 'Wing Marksman',        name_ar: 'قناص متمرس',   desc_en: 'Advanced marksmanship proficiency',        desc_ar: 'إتقان الرماية المتقدمة',            icon: '🎯' },
  { name_en: 'Wing Sniper',          name_ar: 'قناص النخبة',   desc_en: 'Passed advanced sniper course',            desc_ar: 'اجتياز دورة القنص المتقدم',          icon: '🏹' },
  { name_en: 'Wing SWAT',            name_ar: 'فريق سوات',     desc_en: 'Certified SWAT operator',                  desc_ar: 'عضو معتمد بالوحدة الخاصة',           icon: '🛡️' },
  { name_en: 'Wing Tactical Leader', name_ar: 'قائد ميداني',   desc_en: 'Field operations leadership',              desc_ar: 'قيادة العمليات الميدانية',           icon: '⭐' },
  { name_en: 'Wing Instructor',      name_ar: 'مدرب معتمد',    desc_en: 'Qualified to train recruits',              desc_ar: 'مؤهل لتدريب المجندين',               icon: '📘' },
  { name_en: 'Wing K9',              name_ar: 'مدرب كلاب',     desc_en: 'K9 handling certification',                desc_ar: 'التعامل مع الكلاب البوليسية',        icon: '🐕' },
];

async function seedBadges() {
  const { rows: existing } = await pool.query(`SELECT name_en FROM badges`);
  const existingNames = new Set(existing.map(r => r.name_en));
  let created = 0;
  for (const b of BADGES) {
    if (existingNames.has(b.name_en)) continue;
    await pool.query(
      `INSERT INTO badges (name_ar, name_en, desc_ar, desc_en, icon) VALUES ($1,$2,$3,$4,$5)`,
      [b.name_ar, b.name_en, b.desc_ar, b.desc_en, b.icon]
    );
    created++;
  }
  console.log(`Badges seeded: ${created} created, ${BADGES.length - created} already existed.`);
  await pool.end();
}

seedBadges().catch(err => { console.error('Badge seed failed:', err); process.exit(1); });
