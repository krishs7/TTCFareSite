// backend/src/lib/scheduleDb.js (CockroachDB-safe, uses stops.id)
import { getPool } from '../db.js';
import { DateTime } from 'luxon';

function normalizeRouteKey(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, '');
}
const ROUTE_KEY_EXPR =
  `regexp_replace(regexp_replace(lower(coalesce(r.route_short_name,'')), '[^a-z0-9]', '', 'g'), '^0+', '')`;

function nowParts(fromTime) {
  const dt = fromTime instanceof Date
    ? DateTime.fromJSDate(fromTime, { zone: 'America/Toronto' })
    : DateTime.now().setZone('America/Toronto');
  const todayISO = dt.toISODate();
  const secNow = dt.hour * 3600 + dt.minute * 60 + dt.second;
  return { todayISO, secNow };
}

function activeServiceIdsCTE(alias = 'active') {
  return `
    WITH params AS (
      SELECT
        $1::date AS day,
        ((extract(year from $1)::int * 10000) +
         (extract(month from $1)::int * 100) +
          extract(day from $1)::int) AS dayint
    ),
    base AS (
      SELECT c.service_id
      FROM calendar c, params p
      WHERE c.start_date <= p.dayint AND c.end_date >= p.dayint
        AND (
          (extract(dow from p.day)=0 AND c.sunday=1) OR
          (extract(dow from p.day)=1 AND c.monday=1) OR
          (extract(dow from p.day)=2 AND c.tuesday=1) OR
          (extract(dow from p.day)=3 AND c.wednesday=1) OR
          (extract(dow from p.day)=4 AND c.thursday=1) OR
          (extract(dow from p.day)=5 AND c.friday=1) OR
          (extract(dow from p.day)=6 AND c.saturday=1)
        )
    ),
    added AS (SELECT service_id FROM calendar_dates cd, params p WHERE cd.date=p.dayint AND cd.exception_type=1),
    removed AS (SELECT service_id FROM calendar_dates cd, params p WHERE cd.date=p.dayint AND cd.exception_type=2),
    ${alias} AS ((SELECT service_id FROM base) UNION (SELECT service_id FROM added) EXCEPT (SELECT service_id FROM removed))
  `;
}

// ---------- station-aware expansion using stops.id ----------
export async function expandStopIdsIfStation(agencyKey, stopId) {
  const pool = getPool(); if (!pool) return [String(stopId)];
  const ag = String(agencyKey || '').toUpperCase();
  const id = String(stopId);

  const { rows } = await pool.query(
    `SELECT id, location_type, parent_station FROM stops WHERE agency=$1 AND id=$2 LIMIT 1`,
    [ag, id]
  );
  if (!rows.length) return [id];
  const s = rows[0];

  // TTC GTFS often marks the parent "station" as location_type=1, platforms as 0
  if (Number(s.location_type) === 1) {
    const kids = await pool.query(`SELECT id FROM stops WHERE agency=$1 AND parent_station=$2`, [ag, id]);
    const arr = kids.rows.map(r => String(r.id));
    return arr.length ? [id, ...arr] : [id];
  }

  if (s.parent_station) {
    const sibs = await pool.query(`SELECT id FROM stops WHERE agency=$1 AND parent_station=$2`, [ag, s.parent_station]);
    return [String(s.parent_station), ...sibs.rows.map(r => String(r.id))];
  }

  return [id];
}

export async function nextArrivalsFromSchedule(agencyKey, stopId, { limit=10, routeRef=null, fromTime } = {}) {
  const pool = getPool(); if (!pool) return [];
  const { todayISO, secNow } = nowParts(fromTime);
  const normRef = routeRef ? normalizeRouteKey(routeRef) : null;

  async function queryDay(dateStr, secCutoff) {
    const q = `
      ${activeServiceIdsCTE('active')}
      SELECT st.departure_seconds AS depsec,
             coalesce(r.route_short_name,'') AS route_short_name,
             coalesce(t.trip_headsign,'')    AS headsign
      FROM stop_times st
      JOIN trips  t ON t.trip_id  = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE st.stop_id = $2
        AND t.service_id IN (SELECT service_id FROM active)
        AND st.departure_seconds >= $3
        AND ($4::text IS NULL
             OR ${ROUTE_KEY_EXPR} = $4
             OR ${ROUTE_KEY_EXPR} LIKE $4 || '%'
             OR $4 LIKE ${ROUTE_KEY_EXPR} || '%')
      ORDER BY st.departure_seconds ASC
      LIMIT $5
    `;
    const { rows } = await pool.query(q, [dateStr, String(stopId), secCutoff, normRef, limit]);
    const base = DateTime.fromISO(dateStr, { zone: 'America/Toronto' }).startOf('day');
    return rows.map(r => ({
      when: base.plus({ seconds: Number(r.depsec) }).toISO(),
      realtime: false,
      routeShortName: r.route_short_name,
      headsign: r.headsign
    }));
  }

  const out = await queryDay(todayISO, secNow);
  if (out.length >= limit) return out.slice(0, limit);
  const tomorrowISO = DateTime.fromISO(todayISO).plus({ days: 1 }).toISODate();
  const more = await queryDay(tomorrowISO, 0);
  return [...out, ...more].slice(0, limit);
}

export async function linesAtStopWindow(agencyKey, stopId, { windowMin = 60 } = {}) {
  const pool = getPool(); if (!pool) return [];
  const { todayISO, secNow } = nowParts();
  const secLimit = secNow + windowMin * 60;

  const q = `
    ${activeServiceIdsCTE('active')}
    SELECT DISTINCT coalesce(r.route_short_name,'') AS rsn
    FROM stop_times st
    JOIN trips  t ON t.trip_id  = st.trip_id
    JOIN routes r ON r.route_id = t.route_id
    WHERE st.stop_id = $2
      AND t.service_id IN (SELECT service_id FROM active)
      AND st.departure_seconds BETWEEN $3 AND $4
  `;
  const { rows } = await pool.query(q, [todayISO, String(stopId), secNow, secLimit]);
  return rows.map(r => String(r.rsn || '')).filter(Boolean)
    .sort((a,b)=> a.localeCompare(b, undefined, { numeric: true }));
}

