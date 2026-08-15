/**
 * Audit: Nicht-Büdchen-Kandidaten finden und zur manuellen Prüfung markieren.
 * Kein automatisches Löschen — erst Report prüfen, dann --apply.
 *
 * Report:  node scripts/audit-buedchen.mjs
 * Löschen: node scripts/audit-buedchen.mjs --apply
 *
 * Voraussetzung: migrate-session05.sql muss gelaufen sein (import_review_queue Tabelle)
 */

import 'dotenv/config';
import OpenAI from 'openai';
import db from './lib/db.mjs';

const IS_APPLY = process.argv.includes('--apply');

const EXCLUDED_NAME_PATTERNS = [
  { pattern: /\bminimarkt\b/i,              reason: 'name:minimarkt' },
  { pattern: /\bsupermarkt\b/i,             reason: 'name:supermarkt' },
  { pattern: /\btankstelle\b/i,             reason: 'name:tankstelle' },
  { pattern: /\bapotheke\b/i,               reason: 'name:apotheke' },
  { pattern: /\bbäckerei\b/i,               reason: 'name:bäckerei' },
  { pattern: /\bstadtführung\b/i,           reason: 'name:stadtführung' },
  { pattern: /\bwalking\s+(tour|cologne)\b/i, reason: 'name:walking-tour' },
  { pattern: /\bhotel\b/i,                  reason: 'name:hotel' },
  { pattern: /\brewe\b/i,                   reason: 'name:rewe' },
  { pattern: /\bedeka\b/i,                  reason: 'name:edeka' },
  { pattern: /\baldi\b/i,                   reason: 'name:aldi' },
  { pattern: /\blidl\b/i,                   reason: 'name:lidl' },
  { pattern: /\bnetto\b/i,                  reason: 'name:netto' },
  { pattern: /\bpenny\b/i,                  reason: 'name:penny' },
  { pattern: /\btrinkgut\b/i,              reason: 'name:trinkgut' },
  { pattern: /\bgetränkemarkt\b/i,          reason: 'name:getränkemarkt' },
  { pattern: /\bautomatenstore\b/i,         reason: 'name:automatenstore' },
];

const client = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  apiKey:  'ollama',
});

const MODEL = 'qwen2.5:14b';

async function checkWithLLM(name, address) {
  const prompt = `Ist das ein Kölner Büdchen (kleiner Kiosk / Trinkhalle) oder etwas anderes?
Name: ${name}
Adresse: ${address}

Antworte nur mit JSON: {"is_buedchen": true, "confidence": 0.0, "reason": "..."}
Kein Text davor oder danach.`;

  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
    });
    const raw = (res.choices[0]?.message?.content || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(raw);
  } catch {
    return { is_buedchen: true, confidence: 0.5, reason: 'LLM-Fehler' };
  }
}

async function run() {
  const conn = await db.getConnection();

  const [rows] = await conn.query(
    'SELECT id, name, address, google_place_id FROM buedchen'
  );

  const suspects = [];

  for (const row of rows) {
    for (const { pattern, reason } of EXCLUDED_NAME_PATTERNS) {
      if (pattern.test(row.name)) {
        suspects.push({ ...row, exclusion_reason: reason });
        break;
      }
    }
  }

  console.log(`\n${rows.length} Büdchen geprüft | ${suspects.length} Verdächtige gefunden\n`);
  console.log('LLM-Verifikation läuft...\n');

  const confirmed = [];
  const falsePositives = [];

  for (const s of suspects) {
    const llm = await checkWithLLM(s.name, s.address);
    const result = { ...s, llm };

    if (!llm.is_buedchen && llm.confidence > 0.6) {
      confirmed.push(result);
      console.log(`  🚫 ${s.name} — ${llm.reason} (${llm.confidence})`);
    } else {
      falsePositives.push(result);
      console.log(`  ✅ ${s.name} — ist wohl Büdchen (${llm.reason})`);
    }
  }

  console.log(`\nBestätigt kein Büdchen: ${confirmed.length}`);
  console.log(`False Positives:         ${falsePositives.length}`);

  // In import_review_queue schreiben (Bestätigte)
  let queued = 0;
  for (const c of confirmed) {
    try {
      await conn.query(`
        INSERT INTO import_review_queue
          (google_place_id, name, address, exclusion_reason, decision)
        VALUES (?, ?, ?, ?, 'pending')
        ON DUPLICATE KEY UPDATE
          exclusion_reason = VALUES(exclusion_reason),
          decision = IF(decision = 'pending', 'pending', decision)
      `, [c.google_place_id, c.name, c.address, `${c.exclusion_reason}|llm:${c.llm.reason}`]);
      queued++;
    } catch {
      console.warn(`  ⚠️  import_review_queue existiert nicht — migrate-session05.sql zuerst ausführen`);
      break;
    }
  }

  if (queued > 0) {
    console.log(`\n${queued} Einträge in import_review_queue geschrieben.`);
  }

  if (IS_APPLY && confirmed.length > 0) {
    console.log('\n--apply: Lösche bestätigte Nicht-Büdchen...');
    for (const c of confirmed) {
      // FK: enrichment_queue erst leeren
      await conn.query('DELETE FROM enrichment_queue WHERE buedchen_id = ?', [c.id]);
      await conn.query('DELETE FROM buedchen WHERE id = ?', [c.id]);
      console.log(`  🗑  ${c.name} gelöscht`);
    }
    console.log(`\n✅ ${confirmed.length} Einträge gelöscht.`);
  } else if (!IS_APPLY && confirmed.length > 0) {
    console.log('\nZum Löschen: node scripts/audit-buedchen.mjs --apply');
  }

  conn.release();
  await db.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
