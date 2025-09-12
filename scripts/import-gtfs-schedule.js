// scripts/import-gtfs-schedule.js
// Usage: node scripts/import-gtfs-schedule.js --zip ./data/ttc_gtfs.zip --agency TTC
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import csv from 'fast-csv';
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

function getArg(name, def=null){ const i=process.argv.indexOf(`--${name}`); return i>=0?process.argv[i+1]:def; }
const zipPath = getArg('zip');
const agency  = (getArg('agency','TTC')||'TTC').toUpperCase();
const only = (getArg('only','') || '').toLowerCase();
function wants(fileBase) {
  if (!only) return true;
  const key =
    fileBase === 'stops.txt'          ? 'stops' :
    fileBase === 'routes.txt'         ? 'routes' :
    fileBase === 'trips.txt'          ? 'trips' :
    fileBase === 'stop_times.txt'     ? 'stop_times' :
    fileBase === 'calendar.txt'       ? 'calendar' :
    fileBase === 'calendar_dates.txt' ? 'calendar_dates' : '';
  return key === only;
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
if (!zipPath || !fs.existsSync(zipPath)) throw new Error(`Invalid --zip path: ${zipPath}`);

function sslConfig() {
  const caPath = process.env.DATABASE_CA_CERT_PATH;
  const caText = process.env.DATABASE_CA_CERT;
  if (caPath && fs.existsSync(caPath)) return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  if (caText) return { ca: caText, rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

console.log('[import] Connecting to DB…');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  ssl: sslConfig(),
  connectionTimeoutMillis: 10000,
});

function hmsToSec(hms){
  if (!hms) return null;
  const m = String(hms).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const [_,H,M,S] = m;
  return (+H)*3600 + (+M)*60 + (+S); // allow H>=24
}

async function ensureDDL() {
  console.log('[import] Ensuring tables…');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    await c.query(`
      CREATE TABLE IF NOT EXISTS stops (
        stop_id        TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        lat            DOUBLE PRECISION NOT NULL,
        lon            DOUBLE PRECISION NOT NULL,
        agency         TEXT NOT NULL,
        location_type  INT,
        parent_station TEXT
      );
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS routes (
        route_id         TEXT PRIMARY KEY,
        route_short_name TEXT,
        route_long_name  TEXT,
        agency           TEXT NOT NULL
      );
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS trips (
        trip_id       TEXT PRIMARY KEY,
        route_id      TEXT NOT NULL,
        service_id    TEXT NOT NULL,
        trip_headsign TEXT,
        agency        TEXT NOT NULL
      );
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS trips_route_idx   ON trips(route_id);`);
    await c.query(`CREATE INDEX IF NOT EXISTS trips_service_idx ON trips(service_id);`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS stop_times (
        stop_id           TEXT NOT NULL,
        trip_id           TEXT NOT NULL,
        departure_seconds INT,
        arrival_seconds   INT
      );
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS st_stop_dep_idx ON stop_times(stop_id, departure_seconds);`);
    await c.query(`CREATE INDEX IF NOT EXISTS st_trip_idx     ON stop_times(trip_id);`);

    await c.query(`
      CREATE TABLE IF NOT EXISTS calendar (
        service_id TEXT PRIMARY KEY,
        monday SMALLINT, tuesday SMALLINT, wednesday SMALLINT,
        thursday SMALLINT, friday SMALLINT, saturday SMALLINT, sunday SMALLINT,
        start_date INT, end_date INT
      );
    `);

    await c.query(`
      CREATE TABLE IF NOT EXISTS calendar_dates (
        service_id TEXT NOT NULL,
        date       INT  NOT NULL,
        exception_type INT NOT NULL
      );
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS caldates_date_idx ON calendar_dates(date);`);
    await c.query(`CREATE INDEX IF NOT EXISTS caldates_srv_idx  ON calendar_dates(service_id);`);

    await c.query('COMMIT');
    console.log('[import] DDL ready.');
  } catch(e){
    await c.query('ROLLBACK'); throw e;
  } finally {
    c.release();
  }
}

async function importCSV(stream, onRow, { label, logEvery=10000 } = {}) {
  let n = 0;
  return new Promise((resolve,reject)=>{
    csv.parseStream(stream, { headers: true })
      .on('error', reject)
      .on('data', row => {
        n++; if (label && n % logEvery === 0) console.log(`[${label}] parsed: ${n}`);
        onRow(row);
      })
      .on('end', () => { if (label) console.log(`[${label}] parsed total: ${n}`); resolve(); });
  });
}

async function importAll() {
  await ensureDDL();

  console.log('[import] Opening ZIP:', zipPath);
  const zip = fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }));

  let sawEntries = false;
  const warnIfNoEntries = setTimeout(()=> {
    if (!sawEntries) console.warn('[import] Still waiting on ZIP entries… (check the path and file size)');
  }, 5000);

  for await (const entry of zip) {
    sawEntries = true;
    const base = path.basename(entry.path).toLowerCase();
    if (!wants(base)) { entry.autodrain(); continue; }
    if (entry.type !== 'File') { entry.autodrain(); continue; }

    if (base === 'stops.txt') {
      console.log('[stops] reading…');
      const rows = [];
      await importCSV(entry, r => rows.push({
        stop_id: r.stop_id?.toString(),
        name:    r.stop_name?.toString(),
        lat:     Number(r.stop_lat),
        lon:     Number(r.stop_lon),
        location_type: Number(r.location_type || '0'),
        parent_station: r.parent_station ? r.parent_station.toString() : null,
      }), { label: 'stops', logEvery: 5000 });

      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const sql = `INSERT INTO stops(stop_id,name,lat,lon,agency,location_type,parent_station)
                     VALUES($1,$2,$3,$4,$5,$6,$7)
                     ON CONFLICT (stop_id) DO UPDATE
                     SET name=EXCLUDED.name, lat=EXCLUDED.lat, lon=EXCLUDED.lon, agency=EXCLUDED.agency,
                         location_type=EXCLUDED.location_type, parent_station=EXCLUDED.parent_station`;
        let i = 0;
        for (const r of rows) {
          if (!r.stop_id || !r.name || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
          await c.query(sql, [r.stop_id, r.name, r.lat, r.lon, agency, r.location_type, r.parent_station]);
          if (++i % 5000 === 0) console.log(`[stops] upserted ${i}`);
        }
        await c.query('COMMIT');
        console.log(`[stops] upserted ${i}`);
      } catch(e){ await c.query('ROLLBACK'); throw e; }
      finally { c.release(); }

    } else if (base === 'routes.txt') {
      console.log('[routes] reading…');
      const rows = [];
      await importCSV(entry, r => rows.push({
        route_id: r.route_id?.toString(),
        short:    r.route_short_name?.toString() || null,
        long:     r.route_long_name?.toString()  || null,
      }), { label: 'routes', logEvery: 2000 });

      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const sql = `INSERT INTO routes(route_id,route_short_name,route_long_name,agency)
                     VALUES($1,$2,$3,$4)
                     ON CONFLICT (route_id) DO UPDATE
                     SET route_short_name=EXCLUDED.route_short_name,
                         route_long_name=EXCLUDED.route_long_name,
                         agency=EXCLUDED.agency`;
        let i = 0;
        for (const r of rows) {
          if (!r.route_id) continue;
          await c.query(sql, [r.route_id, r.short, r.long, agency]);
          if (++i % 2000 === 0) console.log(`[routes] upserted ${i}`);
        }
        await c.query('COMMIT');
        console.log(`[routes] upserted ${i}`);
      } catch(e){ await c.query('ROLLBACK'); throw e; }
      finally { c.release(); }

    } else if (base === 'trips.txt') {
      console.log('[trips] reading…');
      const rows = [];
      await importCSV(entry, r => rows.push({
        trip_id:    r.trip_id?.toString(),
        route_id:   r.route_id?.toString(),
        service_id: r.service_id?.toString(),
        headsign:   r.trip_headsign?.toString() || null,
      }), { label: 'trips', logEvery: 10000 });

      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const sql = `INSERT INTO trips(trip_id,route_id,service_id,trip_headsign,agency)
                     VALUES($1,$2,$3,$4,$5)
                     ON CONFLICT (trip_id) DO UPDATE
                     SET route_id=EXCLUDED.route_id,
                         service_id=EXCLUDED.service_id,
                         trip_headsign=EXCLUDED.trip_headsign,
                         agency=EXCLUDED.agency`;
        let i = 0;
        for (const r of rows) {
          if (!r.trip_id || !r.route_id || !r.service_id) continue;
          await c.query(sql, [r.trip_id, r.route_id, r.service_id, r.headsign, agency]);
          if (++i % 10000 === 0) console.log(`[trips] upserted ${i}`);
        }
        await c.query('COMMIT');
        console.log(`[trips] upserted ${i}`);
      } catch(e){ await c.query('ROLLBACK'); throw e; }
      finally { c.release(); }

    } else if (base === 'stop_times.txt') {
      console.log('[stop_times] batching inserts…');
      const BATCH = 1000; // keep params low: 1000 rows * 4 params = 4000 placeholders
      let total = 0;

      function buildInsert(rows) {
        const values = [];
        const params = [];
        rows.forEach((r, i) => {
          const p = i * 4;
          values.push(`($${p+1},$${p+2},$${p+3},$${p+4})`);
          params.push(r.stop_id, r.trip_id, r.dep, r.arr);
        });
        const sql = `INSERT INTO stop_times(stop_id,trip_id,departure_seconds,arrival_seconds)
                     VALUES ${values.join(',')}`;
        return { sql, params };
      }

      async function flushRows(rows) {
        if (!rows.length) return;
        const { sql, params } = buildInsert(rows);
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          await c.query(sql, params);
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK'); throw e;
        } finally {
          c.release();
        }
      }

      // Use async iterator so we can await flush (built-in backpressure)
      const parser = csv.parse({ headers: true });
      entry.pipe(parser);
      let batch = [];
      for await (const r of parser) {
        const stop_id = r.stop_id?.toString();
        const trip_id = r.trip_id?.toString();
        const dep = hmsToSec(r.departure_time || r.arrival_time);
        const arr = hmsToSec(r.arrival_time || r.departure_time);
        if (stop_id && trip_id && dep != null) {
          batch.push({ stop_id, trip_id, dep, arr: arr ?? null });
          if (batch.length >= BATCH) {
            const toFlush = batch;      // hand over current batch
            batch = [];                 // immediately clear so we never exceed BATCH
            await flushRows(toFlush);   // await to enforce strict sequencing
            total += toFlush.length;
            if (total % 50000 === 0) console.log(`[stop_times] inserted ${total}`);
          }
        }
      }
      if (batch.length) {
        await flushRows(batch);
        total += batch.length;
      }
      console.log(`[stop_times] done (${total})`);

    } else if (base === 'calendar.txt') {
      console.log('[calendar] reading…');
      const rows = [];
      await importCSV(entry, r => rows.push({
        service_id: r.service_id?.toString(),
        monday: +r.monday, tuesday: +r.tuesday, wednesday: +r.wednesday,
        thursday: +r.thursday, friday: +r.friday, saturday: +r.saturday, sunday: +r.sunday,
        start: +r.start_date, end: +r.end_date,
      }), { label: 'calendar', logEvery: 5000 });

      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const sql = `INSERT INTO calendar(service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date)
                     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                     ON CONFLICT (service_id) DO UPDATE
                     SET monday=EXCLUDED.monday,tuesday=EXCLUDED.tuesday,wednesday=EXCLUDED.wednesday,
                         thursday=EXCLUDED.thursday,friday=EXCLUDED.friday,saturday=EXCLUDED.saturday,sunday=EXCLUDED.sunday,
                         start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date`;
        let i = 0;
        for (const r of rows) {
          if (!r.service_id) continue;
          await c.query(sql, [r.service_id, r.monday,r.tuesday,r.wednesday,r.thursday,r.friday,r.saturday,r.sunday, r.start, r.end]);
          if (++i % 5000 === 0) console.log(`[calendar] upserted ${i}`);
        }
        await c.query('COMMIT');
        console.log(`[calendar] upserted ${i}`);
      } catch(e){ await c.query('ROLLBACK'); throw e; }
      finally { c.release(); }

    } else if (base === 'calendar_dates.txt') {
      console.log('[calendar_dates] streaming inserts…');
      let n = 0;
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const sql = `INSERT INTO calendar_dates(service_id,date,exception_type) VALUES($1,$2,$3)`;
        await importCSV(entry, r => {
          const sid = r.service_id?.toString();
          const d = +r.date; const ex = +r.exception_type;
          if (sid && Number.isFinite(d) && Number.isFinite(ex)) {
            n++; if (n % 5000 === 0) console.log(`[calendar_dates] inserted ${n}`);
            c.query(sql, [sid, d, ex]).catch(err => { throw err; });
          }
        }, { label: 'calendar_dates', logEvery: 5000 });
        await c.query('COMMIT');
        console.log(`[calendar_dates] done (${n})`);
      } catch(e){ await c.query('ROLLBACK'); throw e; }
      finally { c.release(); }

    } else {
      entry.autodrain();
    }
  }

  clearTimeout(warnIfNoEntries);
}

importAll().then(()=> {
  console.log('GTFS schedule import complete.');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });

