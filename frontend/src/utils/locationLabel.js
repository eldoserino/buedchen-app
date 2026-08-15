export function locationLabel(primary) {
  if (!primary) return null;
  const { type, name } = primary;
  if (type === 'rheinufer') return 'Am Rheinufer';
  if (type === 'brücke')    return `An der ${name}`;
  return `Am ${name}`;
}

function displayName(entry) {
  return entry.type === 'rheinufer' ? 'Rhein' : entry.name;
}

// Gibt bis zu 2 Zeilen zurück: "Name 200 m"
// Kein "zum" — kein Genusproblem
export function nearbyLines(locationContext) {
  if (!locationContext) return [];
  const { primary, nearby } = locationContext;
  const lines = [];
  if (primary?.name && primary?.distance_m != null)
    lines.push(`${displayName(primary)} ${primary.distance_m} m`);
  if (nearby?.[0]?.name && nearby[0]?.distance_m != null)
    lines.push(`${displayName(nearby[0])} ${nearby[0].distance_m} m`);
  return lines;
}
