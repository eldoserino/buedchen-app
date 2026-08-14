/**
 * Editorial Scraper — direktes Substring/Token/Adress-Matching, kein LLM.
 *
 * Alle Büdchen-Namen werden direkt gegen den Artikel-Text geprüft.
 * Schreibt in editorial_sources (Detail) UND editorial_badges (UI).
 * Unbestätigte Token-Matches → scripts/tmp/editorial-unconfirmed.json
 *
 * Ausführen:
 *   node scripts/scrape-editorial.mjs            (live, schreibt in DB)
 *   node scripts/scrape-editorial.mjs --dry-run  (zeigt Matches, ändert nichts)
 *   node scripts/scrape-editorial.mjs --reset    (löscht alle editorial-Daten zuerst)
 */

import 'dotenv/config';
import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR   = path.join(__dirname, 'tmp');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Wörter die in Büdchen-Artikeln generisch vorkommen — keine sicheren Matches
const GENERIC = new Set([
  'kiosk', 'büdchen', 'bude', 'lotto', 'shop', 'imbiss', 'eck', 'ecke',
  'tabak', 'presse', 'snack', 'cafe', 'kaffee', 'getränke', 'getranke',
  'lebensmittel', 'spirituosen', 'zeitschriften', 'biergarten',
]);

// Kölner Branchen entfernt: Branchen-Verzeichnis, kein redaktioneller Artikel.
// Produziert False Positives durch generische Kategorietexte ("Trinkhalle", "Kiosk").
const EDITORIAL_SOURCES = [
  {
    name: 'Mit Vergnügen Köln',
    urls: [
      'https://koeln.mitvergnuegen.com/2025/besondere-buedchen/',
      'https://koeln.mitvergnuegen.com/2019/11-ganz-besondere-koelner-buedchen-die-du-kennen-solltest/',
    ],
  },
  {
    name: 'Geheimtipp Köln',
    urls: [
      'https://geheimtipp-koeln.de/geheimtipp/unsere-top-7-der-koelner-buedchen-buedchenliebe%C2%B3/',
    ],
  },
  {
    name: 'KölnTourismus',
    urls: [
      'https://www.koelntourismus.de/erlebnisse-lifestyle/lifestyle/buedchen-kultur',
    ],
  },
];

function normalize(s) {
  return s.toLowerCase()
    .replace(/[''`\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return htmlToText(await res.text());
}

function extractSnippet(text, searchStr, contextLen = 80) {
  const idx = text.toLowerCase().indexOf(searchStr.toLowerCase());
  if (idx < 0) return '';
  const start = Math.max(0, idx - 25);
  const end   = Math.min(text.length, idx + searchStr.length + contextLen);
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0)          snippet = '…' + snippet;
  if (end < text.length)  snippet += '…';
  return snippet;
}

/**
 * Prüft ob die Straßenadresse eines Büdchens im Artikel-Text erscheint.
 * Erkennt "Herderstraße 42" und "Herderstr. 42" als gleichwertig.
 */
function addressInText(address, normText) {
  if (!address) return false;
  // Nur Straße + Hausnummer (vor erstem Komma), Punkte entfernen
  const base = address.split(',')[0].trim().toLowerCase()
    .replace(/[''`\-]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const abbr = base.replace(/straße/g, 'str').replace(/strasse/g, 'str');
  const textNoDot = normText.replace(/\./g, '');
  return textNoDot.includes(base) || textNoDot.includes(abbr);
}

/**
 * Findet alle Büdchen die im Text vorkommen — ohne LLM.
 *
 * Strategie 1 — Vollständiger Name (exakt):         → Badge
 * Strategie 2 — Distinktiver Token (≥ 9 Zeichen):  → kein Badge (unbestätigt)
 * Strategie 3 — Token + Adresse im Text:            → Badge (hohe Konfidenz)
 *
 * Namen die komplett aus generischen Wörtern bestehen werden übersprungen.
 */
function findMentions(text, allBuedchen) {
  const normText = normalize(text);
  const results  = [];

  for (const b of allBuedchen) {
    const normFull = normalize(b.name);

    const meaningfulParts = normFull.split(/\s+/)
      .map(t => t.replace(/[^a-zäöüß]/gu, ''))
      .filter(t => t.length > 2);
    if (meaningfulParts.length === 0 || meaningfulParts.every(t => GENERIC.has(t))) continue;

    // Strategie 1: exakter Name → Badge
    if (normText.includes(normFull)) {
      results.push({
        buedchen:  b,
        snippet:   extractSnippet(text, b.name),
        matchType: 'exact',
        badge:     true,
      });
      continue;
    }

    // Strategie 2/3: distinktiver Token ≥ 9 Zeichen
    const distinctiveTokens = normFull
      .split(/\s+/)
      .map(t => t.replace(/[^a-zäöüß]/gu, ''))
      .filter(t => t.length >= 9 && !GENERIC.has(t));

    if (distinctiveTokens.length > 0 && distinctiveTokens.some(t => normText.includes(t))) {
      const longestToken = distinctiveTokens.reduce((a, b) => a.length > b.length ? a : b);

      // Strategie 3: Token + Adresse im Text → Badge
      const addrConfirmed = addressInText(b.address, normText);

      results.push({
        buedchen:  b,
        snippet:   extractSnippet(text, longestToken),
        matchType: addrConfirmed ? 'address' : 'token',
        badge:     addrConfirmed,
      });
    }
  }

  return results;
}

const isDryRun = process.argv.includes('--dry-run');
const isReset  = process.argv.includes('--reset');

async function main() {
  const conn = await db.getConnection();

  if (isReset) {
    if (isDryRun) {
      console.log('ℹ️  --reset mit --dry-run: kein echtes Reset\n');
    } else {
      await conn.query(
        'UPDATE buedchen SET editorial_sources = NULL, editorial_badges = NULL WHERE editorial_sources IS NOT NULL OR editorial_badges IS NOT NULL'
      );
      console.log('🗑️  Alle editorial_sources und editorial_badges zurückgesetzt\n');
    }
  }

  // address für Strategie 3 mitladen
  const [allBuedchen] = await conn.query('SELECT id, name, address FROM buedchen');
  console.log(`📋 ${allBuedchen.length} Büdchen in DB${isDryRun ? ' (dry-run — keine DB-Änderungen)' : ''}\n`);

  let totalNew = 0;
  const allUnconfirmed = [];  // Token-Matches ohne Badge → für Agent-Review

  for (const source of EDITORIAL_SOURCES) {
    for (const url of source.urls) {
      process.stdout.write(`📰 ${source.name}\n   ${url}\n   Lade... `);

      let text;
      try {
        text = await fetchText(url);
        process.stdout.write(`${text.length} Zeichen\n`);
      } catch (err) {
        console.log(`❌ Fetch-Fehler: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const mentions    = findMentions(text, allBuedchen);
      const confirmed   = mentions.filter(m => m.badge);
      const unconfirmed = mentions.filter(m => !m.badge);
      console.log(`   ${confirmed.length} mit Badge (exact/address), ${unconfirmed.length} unbestätigt (token)\n`);

      // Unbestätigte Kandidaten sammeln — Artikel-Text für Agent
      if (unconfirmed.length > 0) {
        allUnconfirmed.push({
          source:       source.name,
          url,
          article_text: text.slice(0, 15000),
          candidates:   unconfirmed.map(m => ({
            id:      m.buedchen.id,
            name:    m.buedchen.name,
            address: m.buedchen.address,
            snippet: m.snippet,
          })),
        });
      }

      for (const { buedchen, snippet, matchType, badge } of mentions) {
        const icon      = badge ? '✅' : '🔍';
        const typeLabel = matchType === 'address' ? 'address ✓' : matchType;
        console.log(`   ${icon} [${typeLabel}${badge ? '' : ', kein Badge'}] "${buedchen.name}"`);
        if (snippet) console.log(`        "${snippet.slice(0, 70)}"`);

        if (isDryRun) continue;

        const [rows] = await conn.query(
          'SELECT editorial_sources, editorial_badges FROM buedchen WHERE id = ?',
          [buedchen.id]
        );
        // mysql2 parst JSON-Spalten automatisch → kein JSON.parse nötig
        const existingSources = rows[0]?.editorial_sources || [];
        const alreadyListed   = existingSources.some(e => e.source === source.name && e.url === url);

        if (!alreadyListed) {
          existingSources.push({
            source:     source.name,
            url,
            snippet:    snippet.slice(0, 80),
            scraped_at: new Date().toISOString().slice(0, 10),
            match_type: matchType,
          });

          const existingBadges = rows[0]?.editorial_badges || [];
          const badges = badge
            ? [...new Set([...existingBadges, source.name])]
            : existingBadges;

          await conn.query(
            'UPDATE buedchen SET editorial_sources = ?, editorial_badges = ? WHERE id = ?',
            [JSON.stringify(existingSources), JSON.stringify(badges), buedchen.id]
          );
          totalNew++;
        }
      }

      console.log('');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Token-Match-Kandidaten für Agent-Review speichern
  if (allUnconfirmed.length > 0) {
    await fs.mkdir(TMP_DIR, { recursive: true });
    const outPath = path.join(TMP_DIR, 'editorial-unconfirmed.json');
    await fs.writeFile(outPath, JSON.stringify(allUnconfirmed, null, 2), 'utf8');
    const total = allUnconfirmed.reduce((n, g) => n + g.candidates.length, 0);
    console.log(`\n💾 ${total} Token-Kandidaten für Agent-Review gespeichert:`);
    console.log(`   ${outPath}`);
    console.log(`   → nach Agent-Review: node scripts/write-editorial-badges.mjs\n`);
  }

  conn.release();
  await db.end();

  if (isDryRun) {
    console.log('Dry-run abgeschlossen — nichts gespeichert.');
  } else {
    console.log(`Fertig: ${totalNew} neue editorial_sources-Einträge in DB geschrieben.`);
  }
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
