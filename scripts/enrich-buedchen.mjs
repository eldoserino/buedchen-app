/**
 * Büdchen Einzel-Enrichment (VPS-Cron) — Script 2
 * Identische Logik wie bulk-enrich.mjs, nutzt OpenRouter statt lokales Ollama.
 * Verarbeitet nur neue oder ältere Büdchen (enriched_at NULL oder > 30 Tage).
 *
 * DEAKTIVIERT — erst nach Validierung des Bulk-Enrichments aktivieren.
 * Dry-Run: node scripts/enrich-buedchen.mjs --dry-run
 *
 * Cron-Eintrag (als Kommentar, NICHT aktivieren):
 * # 30 3 * * 1 node /var/www/buedchen/scripts/enrich-buedchen.mjs \
 * #   >> /var/log/buedchen-enrich.log 2>&1
 */

import 'dotenv/config';
import OpenAI from 'openai';
import db from './lib/db.mjs';
import { getPoiDistances, getBuedchenType } from './lib/overpass.mjs';
import { buildEnrichPrompt, validateLLMOutput } from './lib/enrich-prompt.mjs';

const IS_DRY_RUN = process.argv.includes('--dry-run');

const MODELS = [
  'qwen/qwen-2.5-72b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

const GOOGLE_API_KEY       = process.env.GOOGLE_PLACES_API_KEY;
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.65');
const DELAY_MS             = 3000;
const BATCH_PAUSE          = 15000;
const BATCH_SIZE           = 5;
// Büdchen älter als X Tage erneut anreichern
const STALE_DAYS           = 30;

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey:  process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://buedchen.slightlymad.de',
    'X-Title':      'buedchen.app',
  },
});

async function fetchReviews(placeId) {
  if (!placeId || !GOOGLE_API_KEY) return [];
  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key':   GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'reviews',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.reviews || []).slice(0, 10).map(r => ({
      text:   r.text?.text || '',
      rating: r.rating || 0,
    })).filter(r => r.text.length > 10);
  } catch {
    return [];
  }
}

async function callLLM(prompt, modelIndex = 0) {
  if (modelIndex >= MODELS.length) throw new Error('Alle Modelle erschöpft');
  try {
    const response = await client.chat.completions.create({
      model:       MODELS[modelIndex],
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });
    return response.choices[0]?.message?.content || '';
  } catch (err) {
    if (err.status === 429 || err.status === 503) {
      console.log(`  ⟳ ${MODELS[modelIndex]} rate-limited, Fallback auf ${MODELS[modelIndex + 1] ?? 'keines'}`);
      return callLLM(prompt, modelIndex + 1);
    }
    throw err;
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  if (IS_DRY_RUN) {
    console.log('🔍 DRY-RUN — keine DB-Schreibvorgänge\n');
  }

  const conn = await db.getConnection();

  const [buedchenList] = await conn.query(
    `SELECT id, name, address, veedel, lat, lng, google_place_id, google_rating, google_review_count
     FROM buedchen
     WHERE enriched_at IS NULL
        OR enriched_at < DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY enriched_at ASC, google_review_count DESC
     LIMIT 50`,
    [STALE_DAYS]
  );

  console.log(`\n📋 ${buedchenList.length} Büdchen zu verarbeiten\n`);

  let processed = 0, queued = 0, errors = 0;

  for (let i = 0; i < buedchenList.length; i++) {
    const b = buedchenList[i];
    const label = `[${i + 1}/${buedchenList.length}] ${b.name}`;

    try {
      const reviews = await fetchReviews(b.google_place_id);

      let distances = null;
      try {
        distances = await getPoiDistances(b.lat, b.lng);
      } catch {
        // Overpass-Fehler: Distanzen bleiben null
      }

      const buedchen_type = getBuedchenType(distances);
      const prompt        = buildEnrichPrompt(b, reviews);

      if (IS_DRY_RUN) {
        console.log(`${label}\n  Prompt (${prompt.length} Zeichen), ${reviews.length} Reviews, Typ: ${buedchen_type}`);
        await sleep(500);
        continue;
      }

      const rawLLM = await callLLM(prompt);
      const result = validateLLMOutput(rawLLM, reviews);

      if (!result) {
        await conn.query(
          'INSERT INTO enrichment_queue (buedchen_id, reason, ai_output) VALUES (?, ?, ?)',
          [b.id, 'parse_error', JSON.stringify({ raw: rawLLM.slice(0, 500) })]
        );
        console.log(`${label} ❌ parse-error`);
        errors++;
      } else {
        await conn.query(
          `UPDATE buedchen SET
            buedchen_type = ?, character_tags = ?, ai_summary = ?,
            ai_confidence = ?, poi_distances = ?, enriched_at = NOW()
          WHERE id = ?`,
          [buedchen_type, JSON.stringify(result.tags), result.summary,
           result.confidence, JSON.stringify(distances), b.id]
        );

        if (result.confidence < CONFIDENCE_THRESHOLD) {
          await conn.query(
            'INSERT INTO enrichment_queue (buedchen_id, reason, ai_output) VALUES (?, ?, ?)',
            [b.id, 'low_confidence', JSON.stringify(result)]
          );
          queued++;
        }

        console.log(`${label} ✅ conf=${result.confidence.toFixed(2)} | ${buedchen_type}`);
        processed++;
      }
    } catch (err) {
      console.error(`${label} ❌ ${err.message}`);
      errors++;
    }

    const pause = (i + 1) % BATCH_SIZE === 0 ? BATCH_PAUSE : DELAY_MS;
    await sleep(pause);
  }

  conn.release();
  await db.end();

  if (!IS_DRY_RUN) {
    console.log(`\nFertig: ${processed} OK, ${queued} in Queue, ${errors} Fehler — ${new Date().toISOString()}`);
  }
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
