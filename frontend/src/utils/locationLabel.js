// Generiert das Hero-Label aus location_context.primary
// CSS übernimmt textTransform: uppercase — hier nur Präposition + Name
export function locationLabel(primary) {
  if (!primary) return null;
  const { type, name } = primary;
  if (type === 'rheinufer') return 'Am Rheinufer';
  if (type === 'brücke')    return `An der ${name}`;
  // platz, park, markt, wasser, aussicht, denkmal, streetart, biergarten
  return `Am ${name}`;
}

// Formatiert "IN DER NÄHE"-Zeile aus primary + nearby[0]
export function nearbyText(locationContext) {
  if (!locationContext) return null;
  const { primary, nearby } = locationContext;
  const parts = [];
  if (primary?.name && primary?.distance_m != null)
    parts.push(`${primary.distance_m} m zum ${primary.name}`);
  if (nearby?.[0]?.name && nearby[0]?.distance_m != null)
    parts.push(`${nearby[0].distance_m} m zum ${nearby[0].name}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
