/**
 * Editorial Scraper — Script 3
 * Scrapet bekannte Artikel-URLs, matched Büdchen-Erwähnungen gegen DB.
 *
 * Ausführen: node scripts/scrape-editorial.mjs
 */

import 'dotenv/config';
import OpenAI from 'openai';
import db from './lib/db.mjs';
import { fuzzyMatch } from './lib/fuzzy-match.mjs';
import { buildEditorialPrompt } from './lib/enrich-prompt.mjs';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
const OLLAMA_MODEL    = 'qwen2.5:14b';

const client = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey:  'ollama',
});

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return htmlToText(html);
}

async function extractBuedchenFromText(text, sourceName) {
  const prompt  = buildEditorialPrompt(text, sourceName);
  const response = await client.chat.completions.create({
    model:           OLLAMA_MODEL,
    messages:        [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature:     0.0,
  });

  const raw = response.choices[0]?.message?.content || '{}';
  try {
    const cleaned = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : (parsed.buedchen || parsed.result || []);
  } catch {
    return [];
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const conn = await db.getConnection();

  const [allBuedchen] = await conn.query('SELECT id, name FROM buedchen');
  console.log(`📋 ${allBuedchen.length} Büdchen in DB geladen\n`);

  let totalMatched = 0, totalQueued = 0;

  for (const source of EDITORIAL_SOURCES) {
    for (const url of source.urls) {
      process.stdout.write(`📰 ${source.name}: ${url}\n   Lade ... `);

      let text;
      try {
        text = await fetchText(url);
        process.stdout.write(`${text.length} Zeichen → LLM ...\n`);
      } catch (err) {
        console.log(`❌ Fetch-Fehler: ${err.message}`);
        await sleep(2000);
        continue;
      }

      let mentions;
      try {
        mentions = await extractBuedchenFromText(text, source.name);
      } catch (err) {
        console.log(`   ❌ LLM-Fehler: ${err.message}`);
        await sleep(2000);
        continue;
      }

      console.log(`   LLM: ${mentions.length} Büdchen gefunden`);

      for (const mention of mentions) {
        const match = fuzzyMatch(mention.name, allBuedchen);

        if (!match) {
          await conn.query(
            'INSERT INTO enrichment_queue (buedchen_id, reason, ai_output) VALUES (?, ?, ?)',
            [allBuedchen[0]?.id || 'unknown', 'editorial_no_match',
             JSON.stringify({ source: source.name, url, name: mention.name })]
          );
          console.log(`   ⚠️  Kein Match: "${mention.name}" → Queue`);
          totalQueued++;
          continue;
        }

        // Bestehende editorial_sources laden und erweitern
        const [rows] = await conn.query(
          'SELECT editorial_sources FROM buedchen WHERE id = ?',
          [match.id]
        );
        const existing = JSON.parse(rows[0]?.editorial_sources || '[]');

        const alreadyListed = existing.some(
          e => e.source === source.name && e.url === url
        );

        if (!alreadyListed) {
          const entry = {
            source:     source.name,
            url,
            snippet:    (mention.snippet || '').slice(0, 80),
            scraped_at: new Date().toISOString().slice(0, 10),
          };
          existing.push(entry);

          await conn.query(
            'UPDATE buedchen SET editorial_sources = ? WHERE id = ?',
            [JSON.stringify(existing), match.id]
          );

          console.log(`   ✅ Match: "${mention.name}" → "${match.name}" (dist=${match.distance})`);
          totalMatched++;
        }
      }

      await sleep(3000);
    }
  }

  conn.release();
  await db.end();

  console.log(`\nFertig: ${totalMatched} Matches, ${totalQueued} in Review-Queue`);
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
