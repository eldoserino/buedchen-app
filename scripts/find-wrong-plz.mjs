import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Köln PLZ: 50xxx und 51xxx (einige Randbezirke)
// Alles außerhalb davon ist verdächtig
const [rows] = await conn.query(`
  SELECT id, name, address, veedel FROM buedchen
  WHERE address REGEXP '[0-9]{5}'
    AND address NOT REGEXP '5[01][0-9]{3} Köln'
    AND address NOT REGEXP '5[01][0-9]{3} Köln-'
    AND address NOT REGEXP ', Köln'
    AND veedel IS NULL
  ORDER BY address
`);

console.log(`\nVerdächtige PLZ / kein Veedel — ${rows.length} Einträge:\n`);
rows.forEach(r => console.log(`  ${r.name} | ${r.address}`));

conn.release();
await db.end();
