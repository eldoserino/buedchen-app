function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s) {
  return s.toLowerCase().replace(/[''`\-]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Finds the best matching candidate for a name.
 *
 * Substring-Bonus: wenn der gesuchte Name im Kandidaten enthalten ist
 * (oder umgekehrt), wird die effektive Distanz auf den Längenunterschied
 * reduziert — findet also "Lindenkiosk" in "Lindenkiosk Braunsfeld" bei
 * ausreichend hohem maxDist.
 *
 * Returns { id, name, distance } or null if no match within maxDist.
 */
export function fuzzyMatch(name, candidates, maxDist = 2) {
  const normName = normalize(name);
  let best = null;
  let bestDist = Infinity;

  for (const c of candidates) {
    const normCand = normalize(c.name);
    let dist = levenshtein(normName, normCand);

    // Substring-Bonus: einer enthält den anderen vollständig → Distanz = Längenunterschied
    if (normCand.includes(normName) || normName.includes(normCand)) {
      dist = Math.min(dist, Math.abs(normName.length - normCand.length));
    }

    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  return bestDist <= maxDist ? { ...best, distance: bestDist } : null;
}
