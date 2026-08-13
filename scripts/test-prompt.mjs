/**
 * Testet den neuen Prompt gegen 5 Büdchen mit Ollama — kein DB-Write.
 */
import 'dotenv/config';
import OpenAI from 'openai';
import db from './lib/db.mjs';
import { buildEnrichPrompt, validateLLMOutput, calcConfidence } from './lib/enrich-prompt.mjs';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';

const client = new OpenAI({ baseURL: OLLAMA_BASE_URL, apiKey: 'ollama' });

async function fetchReviews(placeId) {
  if (!placeId || !GOOGLE_API_KEY) return [];
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_API_KEY, 'X-Goog-FieldMask': 'reviews' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.reviews || []).slice(0, 10).map(r => ({
      text: r.text?.text || '', rating: r.rating,
    })).filter(r => r.text.length > 10);
  } catch { return []; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const conn = await db.getConnection();

  // Stichprobe: verschiedene Ratings und Veedel
  const [rows] = await conn.execute(`
    SELECT id, name, address, veedel, google_rating, google_review_count,
           google_place_id, buedchen_type, character_tags, ai_summary
    FROM buedchen
    WHERE google_place_id IS NOT NULL AND google_review_count >= 3
    ORDER BY RAND()
    LIMIT 8
  `);

  conn.release();
  await db.end();

  for (const b of rows) {
    const reviews = await fetchReviews(b.google_place_id);
    const prompt  = buildEnrichPrompt(b, reviews);
    const conf    = calcConfidence(reviews);

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`${b.name} (${b.veedel}) | ⭐${b.google_rating} | conf=${conf.toFixed(2)}`);

    let rawLLM = '';
    try {
      const resp = await client.chat.completions.create({
        model: 'qwen2.5:14b',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });
      rawLLM = resp.choices[0]?.message?.content || '';
    } catch (e) {
      console.log(`  ❌ LLM-Fehler: ${e.message}`);
      await sleep(2000);
      continue;
    }

    const result = validateLLMOutput(rawLLM, reviews);

    let tags = [];
    try { tags = JSON.parse(b.character_tags || '[]'); } catch {}

    console.log(`ALT tags:    ${tags.join(', ') || '(keine)'}`);
    console.log(`ALT summary: ${b.ai_summary || '(keine)'}`);
    console.log(`NEU tags:    ${result?.tags?.join(', ') || '(keine)'}`);
    console.log(`NEU summary: ${result?.summary || '(parse-error)'}`);

    await sleep(1500);
  }

  console.log('\n✅ Test abgeschlossen');
}

main().catch(e => { console.error(e); process.exit(1); });
