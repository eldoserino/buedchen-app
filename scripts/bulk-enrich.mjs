/**
 * Büdchen Bulk-Enrichment — Script 1
 * Läuft lokal auf dem Windows-PC mit RTX 4090 Ti Super via Ollama.
 *
 * Ausführen:
 *   Invoke-TrackedTask -Name "buedchen-bulk-enrich" -Command "node scripts/bulk-enrich.mjs"
 *
 * Voraussetzungen:
 *   - SSH-Tunnel auf Port 13306 aktiv: ssh -L 13306:127.0.0.1:3306 -N hetzner
 *   - Ollama läuft: http://localhost:11434 (Windows Service)
 *   - .env mit DB_*, GOOGLE_PLACES_API_KEY, OLLAMA_BASE_URL, CONFIDENCE_THRESHOLD
 */

import 'dotenv/config';
import OpenAI from 'openai';
import db from './lib/db.mjs';
import { buildEnrichPrompt, validateLLMOutput } from './lib/enrich-prompt.mjs';

const OLLAMA_BASE_URL       = process.env.OLLAMA_BASE_URL  || 'http://localhost:11434/v1';
const OLLAMA_MODEL          = 'qwen2.5:14b';
const GOOGLE_API_KEY        = process.env.GOOGLE_PLACES_API_KEY;
const CONFIDENCE_THRESHOLD  = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.65');

const BATCH_SIZE  = 10;
const DELAY_MS    = 1500;
const BATCH_PAUSE = 8000;

const client = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey:  'ollama',
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

async function callLLM(prompt) {
  const response = await client.chat.completions.create({
    model:           OLLAMA_MODEL,
    messages:        [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature:     0.3,
  });
  return response.choices[0]?.message?.content || '';
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const conn = await db.getConnection();

  const [buedchenList] = await conn.query(
    'SELECT id, name, address, veedel, lat, lng, google_place_id, google_rating, google_review_count, buedchen_type FROM buedchen WHERE enriched_at IS NULL ORDER BY google_review_count DESC'
  );

  console.log(`\n🏪 ${buedchenList.length} Büdchen zu verarbeiten (ohne enriched_at)\n`);

  let processed = 0, queued = 0, errors = 0;

  for (let i = 0; i < buedchenList.length; i++) {
    const b = buedchenList[i];
    process.stdout.write(`[${i + 1}/${buedchenList.length}] ${b.name} ... `);

    try {
      // Schritt 1: Google Reviews
      const reviews = await fetchReviews(b.google_place_id);

      // Schritt 2: LLM-Enrichment (geo-Felder bereits durch geo-enrich.mjs gesetzt)
      const prompt  = buildEnrichPrompt(b, reviews);
      const rawLLM  = await callLLM(prompt);
      const result  = validateLLMOutput(rawLLM, reviews);

      if (!result) {
        await conn.query(
          `INSERT INTO enrichment_queue (buedchen_id, reason, ai_output) VALUES (?, ?, ?)`,
          [b.id, 'parse_error', JSON.stringify({ raw: rawLLM.slice(0, 500) })]
        );
        console.log('❌ parse-error → queue');
        errors++;
        await sleep(DELAY_MS);
        continue;
      }

      // Schritt 3: In DB schreiben (geo-Felder werden nicht angefasst)
      await conn.query(
        `UPDATE buedchen SET
          character_tags = ?,
          ai_summary     = ?,
          ai_confidence  = ?,
          enriched_at    = NOW()
        WHERE id = ?`,
        [
          JSON.stringify(result.tags),
          result.summary,
          result.confidence,
          b.id,
        ]
      );

      // Schritt 4: Bei niedrigem Confidence → Review-Queue
      if (result.confidence < CONFIDENCE_THRESHOLD) {
        await conn.query(
          `INSERT INTO enrichment_queue (buedchen_id, reason, ai_output) VALUES (?, ?, ?)`,
          [b.id, 'low_confidence', JSON.stringify(result)]
        );
        console.log(`⚠️  conf=${result.confidence.toFixed(2)} → queue | ${b.buedchen_type}`);
        queued++;
      } else {
        console.log(`✅ conf=${result.confidence.toFixed(2)} | ${b.buedchen_type} | tags: ${result.tags.join(', ')}`);
      }

      processed++;
    } catch (err) {
      console.log(`❌ Fehler: ${err.message}`);
      errors++;
    }

    // Rate-Limiting
    const pause = (i + 1) % BATCH_SIZE === 0 ? BATCH_PAUSE : DELAY_MS;
    await sleep(pause);
  }

  conn.release();
  await db.end();

  console.log(`\n✅ Fertig: ${processed} verarbeitet, ${queued} in Queue, ${errors} Fehler`);
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
