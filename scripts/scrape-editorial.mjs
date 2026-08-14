/**
 * Editorial Scraper — direktes Substring/Token-Matching, kein LLM.
 *
 * Alle 672 Büdchen-Namen werden direkt gegen den Artikel-Text geprüft.
 * Schreibt in editorial_sources (Detail) UND editorial_badges (UI).
 *
 * Ausführen:
 *   node scripts/scrape-editorial.mjs            (live, schreibt in DB)
 *   node scripts/scrape-editorial.mjs --dry-run  (zeigt Matches, ändert nichts)
 *   node scripts/scrape-editorial.mjs --reset    (löscht alle editorial-Daten zuerst)
 */

import 'dotenv/config';
import db from './lib/db.mjs';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Wörter die in Büdchen-Artikeln generisch vorkommen und keine sicheren Matches liefern
const GENERIC = new Set([
  'kiosk', 'büdchen', 'bude', 'lotto', 'shop', 'imbiss', 'eck', 'ecke',
  'tabak', 'presse', 'snack', 'cafe', 'kaffee', 'getränke', 'getranke',
  'lebensmittel', 'spirituosen', 'zeitschriften', 'biergarten',
]);

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
  {
    name: 'Kölner Branchen',
    urls: [
      'https://www.koelnerbranchen.de/buedchen/koeln/',
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

/**
 * Extrahiert den Kontext-Text um eine Fundstelle im Artikel.
 * searchStr wird case-insensitiv gesucht, Snippet kommt aus Originaltext.
 */
function extractSnippet(text, searchStr, contextLen = 80) {
  const idx = text.toLowerCase().indexOf(searchStr.toLowerCase());
  if (idx < 0) return '';
  const start = Math.max(0, idx - 25);
  const end = Math.min(text.length, idx + searchStr.length + contextLen);
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet += '…';
  return snippet;
}

/**
 * Findet alle Büdchen die im Text vorkommen — ohne LLM.
 *
 * Strategie 1 — Vollständiger Name (exakt, nach normalize):
 *   "Büdchen Casablanca" → "büdchen casablanca" in normText → Match (exact)
 *   Schreibt in editorial_sources UND editorial_badges.
 *
 * Strategie 2 — Distinktiver Token (≥ 9 Zeichen, nicht generisch):
 *   "Lindenkiosk Braunsfeld" → "lindenkiosk" in normText → Match (token)
 *   Schreibt nur in editorial_sources (niedrigere Konfidenz, kein Badge).
 *
 * Namen die nur aus generischen Wörtern bestehen (z.B. "Kiosk", "Büdchen")
 * werden komplett übersprungen — zu viele False Positives.
 */
function findMentions(text, allBuedchen) {
  const normText = normalize(text);
  const results  = [];

  for (const b of allBuedchen) {
    const normFull = normalize(b.name);

    // Überspringe Namen die komplett aus generischen Wörtern bestehen
    const meaningfulParts = normFull.split(/\s+/)
      .map(t => t.replace(/[^a-zäöüß]/gu, ''))
      .filter(t => t.length > 2);
    if (meaningfulParts.length === 0 || meaningfulParts.every(t => GENERIC.has(t))) continue;

    // Strategie 1: vollständiger normalisierter Name → exact (Badge-würdig)
    if (normText.includes(normFull)) {
      results.push({
        buedchen:  b,
        snippet:   extractSnippet(text, b.name),
        matchType: 'exact',
        badge:     true,
      });
      continue;
    }

    // Strategie 2: distinktiver Token ≥ 9 Zeichen → token (kein Badge)
    const distinctiveTokens = normFull
      .split(/\s+/)
      .map(t => t.replace(/[^a-zäöüß]/gu, ''))
      .filter(t => t.length >= 9 && !GENERIC.has(t));

    if (distinctiveTokens.length > 0 && distinctiveTokens.some(t => normText.includes(t))) {
      const longestToken = distinctiveTokens.reduce((a, b) => a.length > b.length ? a : b);
      results.push({
        buedchen:  b,
        snippet:   extractSnippet(text, longestToken),
        matchType: 'token',
        badge:     false,
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
      await conn.query("UPDATE buedchen SET editorial_sources = NULL, editorial_badges = NULL WHERE editorial_sources IS NOT NULL OR editorial_badges IS NOT NULL");
      console.log('🗑️  Alle editorial_sources und editorial_badges zurückgesetzt\n');
    }
  }

  const [allBuedchen] = await conn.query('SELECT id, name FROM buedchen');
  console.log(`📋 ${allBuedchen.length} Büdchen in DB${isDryRun ? ' (dry-run — keine DB-Änderungen)' : ''}\n`);

  let totalNew = 0;

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

      const mentions = findMentions(text, allBuedchen);
      console.log(`   ${mentions.length} Matches\n`);

      for (const { buedchen, snippet, matchType, badge } of mentions) {
        const icon = matchType === 'exact' ? '✅' : '🔍';
        console.log(`   ${icon} [${matchType}${badge ? '' : ', kein Badge'}] "${buedchen.name}"`);
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

          // editorial_badges (UI + Map-Marker) nur für exact matches
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
