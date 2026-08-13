import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Bekannte Non-Köln-Städte in Adresse oder Veedel
const [outside] = await conn.query(`
  SELECT id, name, address, veedel, lat, lng
  FROM buedchen
  WHERE address REGEXP 'Leverkusen|Düsseldorf|Wuppertal|Solingen|Remscheid|Grevenbroich|Mönchengladbach|Neuss|Dormagen|Bergisch Gladbach|Langenfeld|Monheim|Hilden|Haan|Velbert|Mettmann|Erkrath|Ratingen|Pulheim|Frechen|Kerpen|Brühl|Wesseling|Troisdorf|Siegburg|Bergheim|Bedburg'
     OR veedel REGEXP 'Leverkusen|Düsseldorf|Wuppertal|Solingen|Grevenbroich'
  ORDER BY address
`);

console.log(`\nAußerhalb Kölns (${outside.length}):\n`);
outside.forEach(r => console.log(`  ${r.name} | ${r.address} | ${r.veedel}`));

// Rheinboulevard und andere Ortsbezeichnungen als Namen
const [orte] = await conn.query(`
  SELECT id, name, address, veedel FROM buedchen
  WHERE name IN ('Rheinboulevard', 'Rodenkirchen', 'REWE To Go', 'Köln Messe/Deutz', 'Einkaufsbahnhof Köln Hbf', 'Waldbad Dünnwald')
  ORDER BY name
`);
console.log(`\nOrte/Institutionen als Namen (${orte.length}):\n`);
orte.forEach(r => console.log(`  ${r.name} | ${r.address} | ${r.veedel}`));

conn.release();
await db.end();
