// scripts/import-trips.js
// Usage: node scripts/import-trips.js --zip ./data/ttc_gtfs.zip --agency TTC
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import csv from 'fast-csv';
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

function arg(name, def=null){ const i=process.argv.indexOf(`--${name}`); return i>=0?process.argv[i+1]:def; }
const zipPath = arg('zip');
const agency  = (arg('agency','TTC')||'TTC').toUpperCase();
if (!zipPath || !fs.existsSync(zipPath)) throw new Error(`Invalid --zip path: ${zipPath}`);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

function sslConfig() {
  const p = process.env.DATABASE_CA_CERT_PATH;
  const t = process.env.DATABASE_CA_CERT;
  if (p && fs.existsSync(p)) return { ca: fs.readFileSync(p,'utf8'), rejectUnauthorized:true };
  if (t) return { ca: t, rejectUnauthorized:true };
  return { rejectUnauthorized:false };
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig(), max: 3 });

function buildInsert(rows){
  const values = [];
  const params = [];
  rows.forEach((r,i)=>{
    const p = i*5;
    values.push(`($${p+1},$${p+2},$${p+3},$${p+4},$${p+5})`);
    params.push(r.trip_id, r.route_id, r.service_id, r.headsign, agency);
  });
  const sql = `INSERT INTO trips(trip_id,route_id,service_id,trip_headsign,agency)
               VALUES ${values.join(',')}
               ON CONFLICT (trip_id) DO UPDATE
               SET route_id=EXCLUDED.route_id,
                   service_id=EXCLUDED.service_id,
                   trip_headsign=EXCLUDED.trip_headsign,
                   agency=EXCLUDED.agency`;
  return { sql, params };
}

async function importTrips() {
  console.log('[trips] streaming inserts…');
  const zip = fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream:true }));

  for await (const entry of zip) {
    const base = path.basename(entry.path).toLowerCase();
    if (entry.type !== 'File' || base !== 'trips.txt') { entry.autodrain(); continue; }

    const BATCH = Number(process.env.TRIPS_BATCH || 1000); // keep params well under 65536
    let total = 0, batch = [];

    const parser = csv.parse({ headers: true });
    entry.pipe(parser);

    for await (const r of parser) {
      const trip_id    = r.trip_id?.toString();
      const route_id   = r.route_id?.toString();
      const service_id = r.service_id?.toString();
      const headsign   = r.trip_headsign?.toString() || null;
      if (!trip_id || !route_id || !service_id) continue;
      batch.push({ trip_id, route_id, service_id, headsign });

      if (batch.length >= BATCH) {
        const { sql, params } = buildInsert(batch);
        await pool.query(sql, params);     // implicit txn per statement (recommended for bulk)
        total += batch.length;
        batch = [];
        if (total % 10000 === 0) console.log(`[trips] inserted ${total}`);
      }
    }
    if (batch.length) {
      const { sql, params } = buildInsert(batch);
      await pool.query(sql, params);
      total += batch.length;
      batch = [];
    }
    console.log(`[trips] done (${total})`);
  }
}

importTrips()
  .then(()=> { console.log('Trips import complete.'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });

