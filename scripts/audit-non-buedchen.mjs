import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Bekannte Non-Büdchen-Kategorien anhand von Name-Pattern
const [rows] = await conn.query(`
  SELECT id, name, address, veedel, google_rating, google_review_count, buedchen_type
  FROM buedchen
  WHERE name REGEXP 'EDEKA|REWE|Lidl|Aldi|Penny|Netto|dm |Rossmann|Müller|Kaufland'
     OR name REGEXP 'Deutsche Post|DHL|Hermes|DPD|UPS|GLS Paket'
     OR name REGEXP 'Kirche|Church|Moschee|Synagoge|Tempel'
     OR name REGEXP 'Tankstelle|TotalEnergies|Shell|Aral|BP |Esso|Jet '
     OR name REGEXP 'McDonald|Burger King|KFC|Subway|Domino|Pizza Hut'
     OR name REGEXP 'Apotheke|Pharmacy|Krankenhaus|Klinik|Arztpraxis'
     OR name REGEXP 'Bürgerhaus|Kulturhaus|Jugendzentrum'
  ORDER BY name
`);

console.log(`\n${rows.length} potenzielle Non-Büdchen gefunden:\n`);
rows.forEach(r => console.log(`  [${r.id.slice(0, 20)}] ${r.name} | ${r.veedel} | ${r.buedchen_type}`));

// Zusätzlich: alle Namen die nach keinem typischen Büdchen klingen
const [all] = await conn.query(`SELECT id, name, veedel FROM buedchen ORDER BY name`);
conn.release();
await db.end();

console.log(`\nGesamt in DB: ${all.length} Einträge`);
