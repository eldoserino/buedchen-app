import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Einträge die gelöscht werden:
// 1. Orte/Institutionen als Büdchen-Name
// 2. Büdchen außerhalb Kölns (Adresse enthält keine Köln-Angabe)

const ORTE_NAMES = [
  'REWE To Go', 'Rodenkirchen', 'Rheinboulevard',
  'Köln Messe/Deutz', 'Waldbad Dünnwald',
];

// Außerhalb Kölns: Adresse enthält bekannte Non-Köln-Städte, aber NICHT "Köln"
const OUTSIDE_WHERE = `
  address IS NOT NULL
  AND address NOT REGEXP 'Köln'
  AND address REGEXP 'Leverkusen|Düsseldorf|Wuppertal|Solingen|Remscheid|Grevenbroich|Dormagen|Bergisch Gladbach|Bergisch-Gladbach|Langenfeld|Frechen-|Monheim|Hilden'
`;

const nameList = ORTE_NAMES.map(n => `'${n}'`).join(', ');

const WHERE = `name IN (${nameList}) OR (${OUTSIDE_WHERE})`;

// Vorschau
const [preview] = await conn.query(`SELECT id, name, address FROM buedchen WHERE ${WHERE} ORDER BY name`);
console.log(`\nZu löschen (${preview.length}):\n`);
preview.forEach(r => console.log(`  ${r.name} | ${r.address}`));

// Queue-Einträge zuerst
await conn.query(`DELETE FROM enrichment_queue WHERE buedchen_id IN (SELECT id FROM buedchen WHERE ${WHERE})`);

// Büdchen löschen
const [result] = await conn.query(`DELETE FROM buedchen WHERE ${WHERE}`);
console.log(`\n✅ ${result.affectedRows} Einträge gelöscht`);

// Restbestand
const [count] = await conn.query('SELECT COUNT(*) as n FROM buedchen');
console.log(`Verbleibend in DB: ${count[0].n} Büdchen`);

conn.release();
await db.end();
