import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

const [rows] = await conn.query(`
  SELECT id, name, address, veedel FROM buedchen
  WHERE address REGEXP 'Mülheim' AND address NOT REGEXP 'Köln'
  ORDER BY name
`);

console.log(`\nMülheim (nicht Köln) — ${rows.length} Einträge:\n`);
rows.forEach(r => console.log(`  ${r.name} | ${r.address}`));

conn.release();
await db.end();
