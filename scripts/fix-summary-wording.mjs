/**
 * Wording-Korrektur: ai_summary darf keine generischen Begriffe enthalten.
 * Ausnahme: wenn der Begriff Teil des Eigennamens ist und als solcher zitiert wird.
 *
 * Modell: qwen2.5:14b via Ollama (lokal)
 *
 * Dry-Run:   node scripts/fix-summary-wording.mjs --dry-run
 * Ausführen: node scripts/fix-summary-wording.mjs
 */

import 'dotenv/config';
import OpenAI from 'openai';
import db from './lib/db.mjs';

const IS_DRY_RUN = process.argv.includes('--dry-run');

const FORBIDDEN = ['Kiosk', 'Bude', 'Trinkhalle', 'Späti', 'Kioske', 'Buden', 'Kaffeeladen'];
const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN.join('|')})\\b`, 'gi');

const client = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  apiKey:  'ollama',
});

const MODEL = 'qwen2.5:14b';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Prüft ob die Summary verbotene Wörter enthält, die NICHT Teil des Eigennamens sind.
function needsRewrite(summary, name) {
  // Entferne den Eigennamen aus der Summary und prüfe dann
  const withoutName = summary.replace(new RegExp(escapeRegex(name), 'gi'), '');
  return FORBIDDEN_RE.test(withoutName);
}

async function rewrite(name, summary) {
  const prompt = `Formuliere diesen Satz über ein Kölner Büdchen um.
Ersetze die Wörter "Kiosk", "Bude", "Trinkhalle", "Späti" durch "Büdchen" oder formuliere so um, dass der Begriff entfällt.

WICHTIG: Der Eigenname "${name}" bleibt unverändert, auch wenn er das Wort "Kiosk" enthält.

Behalte Inhalt, Ton und Länge bei. Maximal 20 Wörter.
Antworte NUR mit dem neuen Satz, kein Kommentar.

ORIGINAL: ${summary}`;

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  });

  return (res.choices[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
}

function validate(text, name) {
  const withoutName = text.replace(new RegExp(escapeRegex(name), 'gi'), '');
  if (FORBIDDEN_RE.test(withoutName)) return false;
  if (text.length > 200) return false;
  if (text.length < 10) return false;
  return true;
}

async function run() {
  const conn = await db.getConnection();

  const [rows] = await conn.query(
    `SELECT id, name, ai_summary FROM buedchen WHERE ai_summary IS NOT NULL AND ai_summary != ''`
  );

  const flagged = rows.filter(r => needsRewrite(r.ai_summary, r.name));
  console.log(`\nBüdchen mit verbotenen Begriffen: ${flagged.length} / ${rows.length}`);

  if (flagged.length === 0) {
    console.log('Nichts zu tun.');
    conn.release();
    await db.end();
    return;
  }

  let changed = 0;
  let failed  = 0;

  for (const row of flagged) {
    // Reset regex lastIndex between calls
    FORBIDDEN_RE.lastIndex = 0;

    const newSummary = await rewrite(row.name, row.ai_summary);
    FORBIDDEN_RE.lastIndex = 0;
    const ok = validate(newSummary, row.name);

    const status = ok ? '✅' : '❌';
    console.log(`\n${status} ${row.name}`);
    console.log(`   ALT: "${row.ai_summary}"`);
    console.log(`   NEU: "${newSummary}"`);

    if (!ok) {
      console.log(`   → Validierung fehlgeschlagen, übersprungen`);
      failed++;
      continue;
    }

    if (!IS_DRY_RUN) {
      await conn.query(
        'UPDATE buedchen SET ai_summary = ?, updated_at = NOW() WHERE id = ?',
        [newSummary, row.id]
      );
    }
    changed++;
  }

  console.log(`\nErgebnis: ${changed} aktualisiert, ${failed} Fehler`);
  if (IS_DRY_RUN) {
    console.log('[DRY-RUN] Keine DB-Änderungen. Ohne --dry-run erneut ausführen.');
  }

  conn.release();
  await db.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
