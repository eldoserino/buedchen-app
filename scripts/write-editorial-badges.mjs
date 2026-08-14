/**
 * Schreibt Agent-bestätigte Token-Matches als editorial_badges in die DB.
 *
 * Input:  scripts/tmp/editorial-agent-results.json
 * Format: [{ buedchen_id, source_name, url }]
 *
 * Ausführen: node scripts/write-editorial-badges.mjs
 */

import 'dotenv/config';
import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './lib/db.mjs';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE  = path.join(__dirname, 'tmp', 'editorial-agent-results.json');

async function main() {
  let results;
  try {
    results = JSON.parse(await fs.readFile(RESULTS_FILE, 'utf8'));
  } catch (err) {
    console.error(`Kann ${RESULTS_FILE} nicht lesen: ${err.message}`);
    process.exit(1);
  }

  console.log(`📋 ${results.length} Agent-bestätigte Matches\n`);

  const conn = await db.getConnection();
  let updated = 0;

  for (const { buedchen_id, source_name, url } of results) {
    const [rows] = await conn.query(
      'SELECT editorial_sources, editorial_badges FROM buedchen WHERE id = ?',
      [buedchen_id]
    );
    if (!rows[0]) {
      console.log(`   ⚠️  ID ${buedchen_id} nicht gefunden`);
      continue;
    }

    const existingSources = rows[0].editorial_sources || [];
    const existingBadges  = rows[0].editorial_badges  || [];

    // match_type aktualisieren oder neuen Eintrag anlegen
    const srcIdx = existingSources.findIndex(e => e.source === source_name && e.url === url);
    if (srcIdx >= 0) {
      existingSources[srcIdx].match_type = 'agent';
    } else {
      existingSources.push({
        source:     source_name,
        url,
        snippet:    '',
        scraped_at: new Date().toISOString().slice(0, 10),
        match_type: 'agent',
      });
    }

    const badges = [...new Set([...existingBadges, source_name])];

    await conn.query(
      'UPDATE buedchen SET editorial_sources = ?, editorial_badges = ? WHERE id = ?',
      [JSON.stringify(existingSources), JSON.stringify(badges), buedchen_id]
    );

    console.log(`   ✅ ID ${buedchen_id}: Badge "${source_name}" gesetzt`);
    updated++;
  }

  conn.release();
  await db.end();

  console.log(`\nFertig: ${updated} Büdchen mit Agent-Badge aktualisiert.`);
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
