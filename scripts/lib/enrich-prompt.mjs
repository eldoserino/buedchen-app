export const ALLOWED_TAGS = new Set([
  'kultbüdchen', 'geheimtipp', 'stammgäste', 'platzbüdchen', 'parkbüdchen',
  'uferbüdchen', 'nachtfalke', 'frühaufsteher', 'kaffee-institution', 'szene',
  'familienfreundlich', 'hunde-willkommen', 'fahrradfreundlich', 'denkmalgebäude',
  'älteste-büdchen', 'seit-jahrzehnten', 'blumengeschmückt', 'mit-aussicht',
  'rheinblick', 'kiez-treff', 'partyort',
]);

export function buildEnrichPrompt(buedchen, reviews) {
  const reviewText = reviews.length > 0
    ? reviews.map((r, i) => `[${i + 1}] "${r.text}" (${r.rating}★)`).join('\n')
    : '(keine Bewertungen vorhanden)';

  return `Du analysierst ein Kölner Büdchen anhand seiner Google-Bewertungen.
Antworte NUR mit einem validen JSON-Objekt. Kein Text davor oder danach.
Kein Markdown, keine Code-Blöcke.

BÜDCHEN:
Name: ${buedchen.name}
Adresse: ${buedchen.address || '(unbekannt)'}
Veedel: ${buedchen.veedel || '(unbekannt)'}
Google-Rating: ${buedchen.google_rating ?? 'n/a'} (${buedchen.google_review_count ?? 0} Bewertungen)

BEWERTUNGEN (max. 10 aktuellste):
${reviewText}

ERLAUBTE TAGS — nur aus dieser Liste, 2–5 auswählen:
kultbüdchen, geheimtipp, stammgäste, platzbüdchen, parkbüdchen,
uferbüdchen, nachtfalke, frühaufsteher, kaffee-institution, szene,
familienfreundlich, hunde-willkommen, fahrradfreundlich, denkmalgebäude,
älteste-büdchen, seit-jahrzehnten, blumengeschmückt, mit-aussicht,
rheinblick, kiez-treff, partyort

AUFGABE:
1. Wähle 2–5 passende Tags aus der Liste oben
2. Schreibe einen deutschen Satz (max. 20 Wörter), der beschreibt
   was dieses Büdchen besonders macht — konkret, nicht generisch.
   Beginne nicht mit dem Namen des Büdchens.

ANTWORT (exakt dieses Format):
{
  "tags": ["tag1", "tag2"],
  "summary": "Ein Satz über das Büdchen."
}`.trim();
}

/**
 * Berechnet Confidence programmatisch anhand der Review-Daten.
 * Verlässlicher als LLM-Selbstbewertung.
 */
export function calcConfidence(reviews) {
  if (!reviews || reviews.length === 0) return 0.05;
  const deReviews = reviews.filter(r => {
    const text = r.text || '';
    // Einfache Heuristik: enthält typische deutsche Wörter
    return /\b(und|ist|ein|auch|sehr|hat|mit|für|das|ich|nicht|man|noch|wie|war|die|aber|dann|mehr)\b/i.test(text);
  });
  const count = reviews.length;
  const deFraction = deReviews.length / count;
  if (count >= 8 && deFraction >= 0.7) return 0.92;
  if (count >= 5 && deFraction >= 0.5) return 0.78;
  if (count >= 3) return 0.62;
  if (count >= 1) return 0.45;
  return 0.05;
}

export function validateLLMOutput(raw, reviews = []) {
  try {
    const text = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(text);
    return {
      tags:       (parsed.tags || []).filter(t => ALLOWED_TAGS.has(t)).slice(0, 5),
      summary:    String(parsed.summary || '').slice(0, 200).trim(),
      confidence: calcConfidence(reviews),
    };
  } catch {
    return null;
  }
}

export function buildEditorialPrompt(articleText, sourceName) {
  return `Extrahiere alle Büdchen aus diesem Kölner Artikel.
Antworte NUR mit JSON, kein Text davor oder danach.

ARTIKEL (${sourceName}):
${articleText.slice(0, 4000)}

FORMAT:
{
  "buedchen": [
    { "name": "Name des Büdchens", "snippet": "Kontext aus dem Artikel, max 80 Zeichen" }
  ]
}

Falls keine Büdchen erwähnt werden: { "buedchen": [] }`.trim();
}
