/**
 * Anzeigenamen destillieren: Lange oder beschreibende Rohnamen kürzen.
 * Kurze, saubere Namen (≤ 32 Zeichen, keine Aufzählungen) bleiben unverändert.
 *
 * Dry-Run:   node scripts/generate-display-names.mjs --dry-run
 * Ausführen: node scripts/generate-display-names.mjs
 *
 * Voraussetzung: migrate-session05.sql muss gelaufen sein (display_name, name_source)
 */

import 'dotenv/config';
import OpenAI from 'openai';
import db from './lib/db.mjs';

const IS_DRY_RUN = process.argv.includes('--dry-run');

const client = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  apiKey:  'ollama',
});

const MODEL = 'qwen2.5:14b';

// Generische Warenbegriffe die auf Rohnamen hinweisen
const GOODS_WORDS = [
  /\blotto\b/i, /\btabak(?:waren)?\b/i, /\bzeitung(?:en)?\b/i,
  /\bgetränke\b/i, /\bzigarett(?:en)?\b/i, /\bsnacks?\b/i,
  /\bspirituosen\b/i, /\bpresse\b/i, /\bschreibwaren\b/i,
];

// Straßenmuster + Hausnummer (adresshaltige Namen)
const STREET_RE = /(?:str(?:\.?|aße)|gasse|weg|platz|allee|ring|damm)\s+\d+/i;

function needsShortening(name) {
  if (name.length > 32) return true;
  const commas = (name.match(/,/g) || []).length;
  if (commas >= 2) return true;
  if (STREET_RE.test(name)) return true;
  const goodsCount = GOODS_WORDS.filter(re => re.test(name)).length;
  if (goodsCount >= 3) return true;
  return false;
}

function extractStreetName(address) {
  if (!address) return null;
  // "Berliner Str. 89, 50667 Köln" → "Berliner Str."
  const first = address.split(',')[0];
  const withoutNumber = first.replace(/\s+\d+.*$/, '').trim();
  return withoutNumber || null;
}

async function shorten(name, address, veedel) {
  const prompt = `Destilliere aus diesem Rohnamen eines Kölner Büdchens einen kurzen, lesbaren Anzeigenamen.

REGELN:
- Maximal 28 Zeichen
- Eigennamen und Marken behalten ("Kölnkiosk", "Herr Anton", "Stella")
- Warenaufzählungen entfernen ("Lotto, Tabakwaren, Zeitungen")
- Adressangaben entfernen ("Dürener Str. 89 Nähe Aachener Weiher")
- Generische Zusätze entfernen ("Minimarkt", "Automatenstore")
- Wenn kein Eigenname erkennbar ist: gib exakt "FALLBACK" zurück

ROHNAME: ${name}
ADRESSE: ${address || '(unbekannt)'}
VEEDEL:  ${veedel || '(unbekannt)'}

Antworte NUR mit dem Anzeigenamen oder "FALLBACK".`;

  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });
    return (res.choices[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
  } catch {
    return 'FALLBACK';
  }
}

async function run() {
  const conn = await db.getConnection();

  const [rows] = await conn.query(
    'SELECT id, name, address, veedel FROM buedchen'
  );

  const candidates = rows.filter(r => needsShortening(r.name));

  console.log(`\n${rows.length} Büdchen | ${candidates.length} brauchen Anzeigenamen\n`);

  if (IS_DRY_RUN) {
    console.log('Name'.padEnd(50) + 'display_name'.padEnd(35) + 'source');
    console.log('─'.repeat(90));
  }

  let aiShortened    = 0;
  let addressFallback = 0;
  let unchanged      = 0;

  for (const row of candidates) {
    const result = await shorten(row.name, row.address, row.veedel);

    let displayName;
    let nameSource;

    if (result === 'FALLBACK' || result.length < 2) {
      const street = extractStreetName(row.address);
      displayName = street ? `Büdchen ${street}` : row.name;
      nameSource  = 'address_fallback';
      addressFallback++;
    } else {
      // Sicherheitsnetz: nie länger als 28 Zeichen
      displayName = result.slice(0, 28).trim();
      nameSource  = 'ai_shortened';
      aiShortened++;
    }

    if (IS_DRY_RUN) {
      console.log(
        row.name.slice(0, 48).padEnd(50) +
        displayName.padEnd(35) +
        nameSource
      );
    } else {
      await conn.query(
        'UPDATE buedchen SET display_name = ?, name_source = ? WHERE id = ?',
        [displayName, nameSource, row.id]
      );
    }
  }

  // Nicht verarbeitete Büdchen: name_source bleibt 'original'
  unchanged = rows.length - candidates.length;

  console.log(`\nErgebnis:`);
  console.log(`  KI-gekürzt:      ${aiShortened}`);
  console.log(`  Adress-Fallback: ${addressFallback}`);
  console.log(`  Unverändert:     ${unchanged}`);

  if (IS_DRY_RUN) {
    console.log('\n[DRY-RUN] Keine DB-Änderungen. Ohne --dry-run erneut ausführen.');
  } else {
    console.log('\n✅ Fertig. Frontend nutzt display_name ?? name.');
  }

  conn.release();
  await db.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
