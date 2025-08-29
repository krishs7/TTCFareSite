// scripts/import-gtfs-stops.js
// Usage: npm run import-gtfs -- --zip /path/to/gtfs.zip --agency TTC
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import csv from 'fast-csv';
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

function getArg(name, def = null) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : def;
}

const zipPath = getArg('zip');
const agency = getArg('agency', 'TTC');
const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Populate backend/.env first.');
  process.exit(1);
}
if (!zipPath || !fs.existsSync(zipPath)) {
  console.error('Missing or invalid --zip path to GTFS zip.');
  process.exit(1);
}

const ddl = `
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  agency TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stops_name_idx ON stops (name);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS stops_name_trgm_idx ON stops USING gin (name gin_trgm_ops);
  END IF;
END$$;`;

async function importStops() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
  const client = await pool.connect();
  try {
    await client.query(ddl);
  } finally {
    client.release();
  }

  console.log(`Importing stops from ${zipPath} for agency ${agency}...`);
  const zip = fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }));

  let count = 0;
  for await (const entry of zip) {
    if (entry.type === 'File' && path.basename(entry.path).toLowerCase() === 'stops.txt') {
      await new Promise((resolve, reject) => {
        const rows = [];
        csv.parseStream(entry, { headers: true })
          .on('error', reject)
          .on('data', (row) => {
            const id = row.stop_id?.toString();
            const name = row.stop_name?.toString();
            const lat = Number(row.stop_lat);
            const lon = Number(row.stop_lon);
            if (id && name && Number.isFinite(lat) && Number.isFinite(lon)) {
              rows.push({ id, name, lat, lon });
            }
          })
          .on('end', async () => {
            const client2 = await pool.connect();
            try {
              await client2.query('BEGIN');
              const text = `INSERT INTO stops (id, name, lat, lon, agency)
                            VALUES ($1,$2,$3,$4,$5)
                            ON CONFLICT (id) DO UPDATE
                            SET name=EXCLUDED.name, lat=EXCLUDED.lat, lon=EXCLUDED.lon, agency=EXCLUDED.agency`;
              for (const r of rows) {
                await client2.query(text, [r.id, r.name, r.lat, r.lon, agency]);
              }
              await client2.query('COMMIT');
              count += rows.length;
              resolve();
            } catch (e) {
              await client2.query('ROLLBACK');
              reject(e);
            } finally {
              client2.release();
            }
          });
      });
    } else {
      entry.autodrain();
    }
  }
  console.log(`Imported ${count} stops for ${agency}.`);
  process.exit(0);
}

importStops().catch((e) => {
  console.error(e);
  process.exit(1);
});

