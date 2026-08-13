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

ERLAUBTE TAGS — exakt aus dieser Liste, 2–4 auswählen:
geheimtipp, stammgäste, nachtfalke, frühaufsteher, kaffee-institution, szene,
familienfreundlich, hunde-willkommen, fahrradfreundlich, denkmalgebäude,
älteste-büdchen, seit-jahrzehnten, blumengeschmückt, mit-aussicht,
rheinblick, kiez-treff, partyort, kultbüdchen

TAG-REGELN (wichtig!):
- kultbüdchen: NUR wenn Bewertungen ausdrücklich Kultstatus, jahrzehntelange Tradition oder
  besondere lokale Bekanntheit erwähnen. NICHT als Standardtag vergeben.
- stammgäste: wenn Bewertungen regelmäßige Stammkunden oder familiäre Atmosphäre erwähnen
- geheimtipp: wenn das Büdchen trotz gutem Rating kaum bekannt wirkt oder explizit so beschrieben wird
- Wähle nur Tags die durch die Bewertungen konkret belegt sind

AUFGABE:
1. Wähle 2–4 Tags aus der Liste (kultbüdchen nur wenn eindeutig belegt)
2. Schreibe einen prägnanten deutschen Satz (max. 18 Wörter):
   - Konkret: nenne was das Büdchen tatsächlich auszeichnet (Lage, Besonderheit, Atmosphäre)
   - NICHT generisch: vermeide "beliebter Treffpunkt", "nettes Büdchen", "guter Service"
   - Nutze Details aus den Bewertungen wenn vorhanden
   - Beginne nicht mit dem Namen des Büdchens

ANTWORT (exakt dieses Format):
{
  "tags": ["tag1", "tag2"],
  "summary": "Ein konkreter Satz über das Büdchen."
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
