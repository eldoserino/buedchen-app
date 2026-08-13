// Geo-Typen (platzbüdchen/parkbüdchen/uferbüdchen/straßenbüdchen) werden
// durch geo-enrich.mjs gesetzt — NICHT als LLM-Tags verwenden.
export const ALLOWED_TAGS = new Set([
  'kultbüdchen', 'geheimtipp', 'stammgäste', 'nachtfalke', 'frühaufsteher',
  'kaffee-institution', 'szene', 'familienfreundlich', 'hunde-willkommen',
  'fahrradfreundlich', 'denkmalgebäude', 'älteste-büdchen', 'seit-jahrzehnten',
  'blumengeschmückt', 'mit-aussicht', 'rheinblick', 'veedel-treff', 'partyort',
]);

export function buildEnrichPrompt(buedchen, reviews) {
  const reviewText = reviews.length > 0
    ? reviews.map((r, i) => `[${i + 1}] "${r.text}" (${r.rating}★)`).join('\n')
    : '(keine Bewertungen vorhanden)';

  return `Du analysierst einen Kölner Kiosk anhand seiner Google-Bewertungen.
Antworte NUR mit einem validen JSON-Objekt. Kein Text davor oder danach.
Kein Markdown, keine Code-Blöcke.

KIOSK:
Name: ${buedchen.name}
Adresse: ${buedchen.address || '(unbekannt)'}
Veedel: ${buedchen.veedel || '(unbekannt)'}
Google-Rating: ${buedchen.google_rating ?? 'n/a'} (${buedchen.google_review_count ?? 0} Bewertungen)

BEWERTUNGEN (egal ob Deutsch oder Englisch, max. 10):
${reviewText}

── TAGS ──────────────────────────────────────────────────────────────
Wähle 1–3 Tags. Nur aus dieser Liste, nur wenn durch Bewertungen belegt:

kultbüdchen   → Nur wenn Bewertungen "Institution", "seit Jahrzehnten", "Kult", "beste in Köln"
                oder ähnlich explizit formulieren. Nicht als Default-Tag.
stammgäste    → Regelmäßige Besucher, Stammkundschaft, "kenn ich schon ewig", "komme täglich"
geheimtipp    → Unbekannt trotz Qualität, "kaum jemand weiß davon", kleines Versteck
nachtfalke    → Auffällig lange geöffnet, Nachtbetrieb, 24h, sehr late hours
frühaufsteher → Öffnet früh, Frühstücksangebot, morgens erste Anlaufstelle
kaffee-institution → Kaffee ist Hauptthema der Bewertungen, Espresso/Cappuccino, Kaffeepause
szene         → Treffpunkt einer bestimmten Szene, Party-Umfeld, besonderer Veedel-Charakter
familienfreundlich → Bewertungen erwähnen Kinder, Familie, kinderfreundlich
hunde-willkommen → Hunde explizit willkommen oder erwähnt
fahrradfreundlich → Fahrradroute, Radfahrer, Abstellmöglichkeit erwähnt
denkmalgebäude → Historisches Gebäude, denkmalgeschützt, altes Haus
älteste-büdchen → "schon immer da", sehr lange Geschichte erwähnt
seit-jahrzehnten → Jahrzehnte in Betrieb, generationsübergreifend
blumengeschmückt → Blumenschmuck, Bepflanzung, schöne Außengestaltung
mit-aussicht  → Schöner Blick, erhöhte Lage, Panorama
rheinblick    → Rhein sichtbar oder Nähe explizit erwähnt
veedel-treff  → Nachbarschaftstreffpunkt, Dorfplatz-Atmosphäre, Veedel-Gemeinschaft
partyort      → Party, Feiern, Eventlocation, Nachtleben

Falls kein Tag wirklich passt: leeres Array [].

── SUMMARY ───────────────────────────────────────────────────────────
Schreibe EINEN deutschen Satz (max. 18 Wörter).

ZIEL: Was macht DIESEN Kiosk von anderen unterscheidbar?
Suche das spezifischste Detail aus den Bewertungen:
  - Besonderes Produkt: "immer eiskaltes Bier", "Lavash und Basturma", "internationale Snacks"
  - Besondere Öffnungszeiten: "auch sonntags um 7", "bis weit nach Mitternacht"
  - Besonderer Ort: "direkt am Rheinufer", "unter dem Bahnbogen"
  - Besondere Geschichte: "seit 40 Jahren im Veedel"
  - Besondere Atmosphäre die KONKRET beschrieben wird

VERBOTEN (zu generisch, gilt für jeden Kiosk):
  ✗ "freundlicher Service" / "freundliches Personal"
  ✗ "faire Preise" / "gute Preise"
  ✗ "großes Sortiment" / "breite Auswahl"
  ✗ "beliebter Treffpunkt" / "nettes Büdchen"
  ✗ "empfehlenswert"

BEISPIELE guter Summarys:
  ✓ "Das einzige 24-Stunden-Büdchen in Bickendorf mit riesiger Shisha-Abteilung."
  ✓ "Internationale Snacks rund um die Uhr — Lebensretter auf der Radtour."
  ✓ "Die Geschwister hier kennt das ganze Nippes, Stammgäste seit Jahrzehnten."
  ✓ "Täglich frischer Cappuccino für 1,50 € — der günstigste im Veedel."
  ✓ "Direkt an der Endhaltestelle, für Rodenkirchen die letzte Einkaufsstation."

Falls die Bewertungen zu dünn sind für ein spezifisches Detail:
  → Schreibe was der Kiosk hauptsächlich anbietet, möglichst konkret.

── ANTWORT ───────────────────────────────────────────────────────────
{
  "tags": ["tag1"],
  "summary": "Ein konkreter Satz."
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
