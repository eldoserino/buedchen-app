/**
 * Schreibt Enrichment-Ergebnisse eines Agents in die DB.
 *
 * Ausführen:
 *   node scripts/write-enrichment-results.mjs scripts/tmp/results-0.json
 *
 * Erwartet JSON-Array mit: { id, tags, summary, confidence }
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import db from './lib/db.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/write-enrichment-results.mjs <results-file.json>');
  process.exit(1);
}

const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.50');

const results = JSON.parse(readFileSync(file, 'utf8'));
console.log(`\n📥 ${results.length} Ergebnisse aus ${file}\n`);

let ok = 0, queued = 0, skipped = 0;

for (const r of results) {
  if (!r.id || !Array.isArray(r.tags) || typeof r.summary !== 'string') {
    console.log(`  ⚠️  Übersprungen (ungültig): ${JSON.stringify(r).slice(0, 80)}`);
    skipped++;
    continue;
  }

  const conf = typeof r.confidence === 'number' ? r.confidence : 0.62;

  await db.execute(
    `UPDATE buedchen
     SET character_tags = ?, ai_summary = ?, ai_confidence = ?, enriched_at = NOW()
     WHERE id = ?`,
    [JSON.stringify(r.tags), r.summary.slice(0, 200), conf, r.id]
  );

  if (conf < CONFIDENCE_THRESHOLD) {
    await db.execute(
      `INSERT IGNORE INTO enrichment_queue (buedchen_id, reason, ai_output) VALUES (?, ?, ?)`,
      [r.id, 'low_confidence', JSON.stringify({ tags: r.tags, summary: r.summary })]
    );
    console.log(`  ⚠️  id=${r.id} conf=${conf.toFixed(2)} → queue`);
    queued++;
  } else {
    ok++;
  }
}

await db.end();
console.log(`\n✅ Fertig: ${ok} ok, ${queued} queued, ${skipped} übersprungen\n`);
