/**
 * Bayesian Ranking für Büdchen
 * Gleicht wenige Hochbewertungen gegen viele echte Bewertungen aus.
 *
 * Ausführen: node scripts/compute-ranking.mjs
 * Dry-Run:   node scripts/compute-ranking.mjs --dry-run
 */

import 'dotenv/config';
import db from './lib/db.mjs';

const IS_DRY_RUN = process.argv.includes('--dry-run');

// Schwellwert m: wie viele Bewertungen nötig, um den Durchschnitt vollständig zu schlagen
const M = 40;

async function run() {
  const conn = await db.getConnection();

  // Globaler Durchschnitt C (nur Büdchen mit ≥ 5 Bewertungen, damit Ausreißer raus)
  const [[{ C }]] = await conn.query(`
    SELECT AVG(google_rating) AS C
    FROM buedchen
    WHERE google_review_count >= 5 AND google_rating IS NOT NULL
  `);

  if (!C) {
    console.error('Kein Durchschnitt berechenbar — sind Ratings in der DB?');
    conn.release();
    await db.end();
    process.exit(1);
  }

  console.log(`Globaler Durchschnitt C = ${C.toFixed(3)} (Schwellwert m = ${M})`);

  const [rows] = await conn.query(`
    SELECT id, name, google_rating, google_review_count
    FROM buedchen
    WHERE google_rating IS NOT NULL AND google_review_count IS NOT NULL
  `);

  let updated = 0;
  let nulled  = 0;
  let examples = [];

  for (const row of rows) {
    const v = row.google_review_count;
    const R = parseFloat(row.google_rating);
    const score = (v / (v + M)) * R + (M / (v + M)) * C;
    const rounded = Math.round(score * 1000) / 1000;

    if (examples.length < 5) {
      examples.push({ name: row.name, rating: R, count: v, score: rounded });
    }

    if (!IS_DRY_RUN) {
      await conn.query('UPDATE buedchen SET bayesian_score = ? WHERE id = ?', [rounded, row.id]);
    }
    updated++;
  }

  // Büdchen ohne Rating → NULL (sortieren ans Ende)
  const [[{ withoutRating }]] = await conn.query(`
    SELECT COUNT(*) AS withoutRating FROM buedchen
    WHERE google_rating IS NULL OR google_review_count IS NULL
  `);

  if (!IS_DRY_RUN && withoutRating > 0) {
    await conn.query(`
      UPDATE buedchen SET bayesian_score = NULL
      WHERE google_rating IS NULL OR google_review_count IS NULL
    `);
    nulled = withoutRating;
  }

  console.log(`\nBerechnet: ${updated} Büdchen | Ohne Rating (→ NULL): ${nulled}`);
  console.log('\nBeispiele:');
  for (const e of examples) {
    console.log(`  ${e.name.padEnd(40)} ${e.rating}★ × ${String(e.count).padStart(4)} Bew → Score: ${e.score}`);
  }

  if (IS_DRY_RUN) {
    console.log('\n[DRY-RUN] Keine DB-Änderungen. Ohne --dry-run erneut ausführen.');
  } else {
    console.log('\n✅ Fertig. GET /api/buedchen sortiert jetzt nach bayesian_score.');
  }

  conn.release();
  await db.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
