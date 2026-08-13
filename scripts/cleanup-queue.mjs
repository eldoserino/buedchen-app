import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Statistik vorher
const [[{ total }]] = await conn.execute('SELECT COUNT(*) AS total FROM enrichment_queue WHERE resolved = FALSE');
console.log(`Queue vor Bereinigung: ${total} ungelöste Einträge`);

// Confidence-Verteilung aller Büdchen anzeigen
const [confDist] = await conn.execute(`
  SELECT
    CASE
      WHEN ai_confidence >= 0.90 THEN '0.90+'
      WHEN ai_confidence >= 0.78 THEN '0.78–0.89'
      WHEN ai_confidence >= 0.62 THEN '0.62–0.77'
      WHEN ai_confidence >= 0.45 THEN '0.45–0.61'
      WHEN ai_confidence >= 0.05 THEN '0.05–0.44'
      ELSE 'null'
    END AS band,
    COUNT(*) AS anzahl
  FROM buedchen
  GROUP BY 1
  ORDER BY MIN(ai_confidence) DESC
`);
console.log('\nKonfidenz-Verteilung:');
confDist.forEach(r => console.log(`  ${r.band}: ${r.anzahl}`));

// Queue-Einträge löschen wo das Büdchen jetzt ≥ 0.50 hat (kein echter Review-Fall)
const [del] = await conn.execute(`
  DELETE eq FROM enrichment_queue eq
  JOIN buedchen b ON b.id = eq.buedchen_id
  WHERE eq.reason = 'low_confidence'
    AND b.ai_confidence >= 0.50
    AND eq.resolved = FALSE
`);
console.log(`\nBereinigt: ${del.affectedRows} false-positive Einträge entfernt`);

// Statistik nachher
const [[{ after }]] = await conn.execute('SELECT COUNT(*) AS after FROM enrichment_queue WHERE resolved = FALSE');
console.log(`Queue nach Bereinigung: ${after} verbleibende Einträge (echte Fälle mit conf < 0.50)`);

// Was bleibt in der Queue?
const [remain] = await conn.execute(`
  SELECT eq.reason, COUNT(*) AS n
  FROM enrichment_queue eq
  WHERE eq.resolved = FALSE
  GROUP BY eq.reason
`);
console.log('\nVerbleibend nach Grund:');
remain.forEach(r => console.log(`  ${r.reason}: ${r.n}`));

conn.release();
await db.end();
