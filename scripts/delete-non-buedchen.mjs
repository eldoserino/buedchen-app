import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Nur löschen wenn KEIN "Kiosk" oder "Büdchen" im Namen steht.
// So bleiben echte Büdchen erhalten die nebenbei Paketservice anbieten.
const DELETE_PATTERNS = [
  // Paketdienstleister (rein)
  "name REGEXP '^Deutsche Post Filiale'",
  "name REGEXP '^DHL Paketshop'",
  "name REGEXP '^Hermes PaketShop'",
  "name REGEXP '^Hermes Paket Shop'",
  "name REGEXP '^GLS PaketShop'",
  "name REGEXP '^UPS Access Point'",
  "name REGEXP '^DPD Pickup'",
  // Supermärkte
  "name REGEXP '^EDEKA '",
  "name REGEXP '^REWE$'",
  "name = 'REWE To Go bei Aral'",
  // Sonstiges
  "name = 'TotalEnergies Tankstelle'",
  "name = 'Versöhnungskirche'",
  "name = 'Bürgerhaus Kalk'",
];

const where = DELETE_PATTERNS.map(p => `(${p})`).join(' OR ');

// Vorschau
const [preview] = await conn.query(`SELECT id, name, veedel FROM buedchen WHERE ${where} ORDER BY name`);
console.log(`\nZu löschende Einträge (${preview.length}):\n`);
preview.forEach(r => console.log(`  ${r.name} | ${r.veedel}`));

// Erst Queue-Einträge löschen (Foreign-Key-Constraint)
await conn.query(`DELETE FROM enrichment_queue WHERE buedchen_id IN (SELECT id FROM buedchen WHERE ${where})`);

// Dann Büdchen löschen
const [result] = await conn.query(`DELETE FROM buedchen WHERE ${where}`);
console.log(`\n✅ ${result.affectedRows} Einträge gelöscht`);

// Grenzfälle anzeigen
const [borderline] = await conn.query(`
  SELECT id, name, veedel FROM buedchen
  WHERE name IN ('REWE To Go', 'Rodenkirchen')
     OR (name REGEXP 'Hermeskeiler' AND name REGEXP 'Kiosk')
  ORDER BY name
`);
if (borderline.length > 0) {
  console.log(`\nGrenzfälle (manuell prüfen):`);
  borderline.forEach(r => console.log(`  ${r.name} | ${r.veedel}`));
}

conn.release();
await db.end();
