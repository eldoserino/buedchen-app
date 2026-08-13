import 'dotenv/config';
import db from './lib/db.mjs';

const conn = await db.getConnection();

// Vorgebirger Kiosk hatte eine gute Summary die fälschlich gelöscht wurde.
// enriched_at zurücksetzen damit bulk-enrich sie neu generiert.
const [r] = await conn.query(
  "UPDATE buedchen SET enriched_at = NULL WHERE name = 'Vorgebirger Kiosk'"
);
console.log(`Reset: ${r.affectedRows} Büdchen`);

conn.release();
await db.end();
