// backend/src/lib/schedule.js
import { getPool } from '../db.js';

export async function nextArrivalsFromSchedule(agencyKey, stopId, { limit = 3 } = {}) {
  const pool = getPool();
  if (!pool) return [];

  // Requires tables: calendar, calendar_dates, trips, stop_times
  // Quick filter for services active today
  const { rows: r } = await pool.query(`
    WITH today AS (
      SELECT
        to_char(current_date, 'D')::int AS dow, -- 1..7 (Sun=1)
        current_date::date AS d
    ),
    active_services AS (
      SELECT c.service_id
      FROM calendar c, today t
      WHERE t.d BETWEEN c.start_date AND c.end_date
        AND CASE t.dow
              WHEN 1 THEN c.sunday
              WHEN 2 THEN c.monday
              WHEN 3 THEN c.tuesday
              WHEN 4 THEN c.wednesday
              WHEN 5 THEN c.thursday
              WHEN 6 THEN c.friday
              WHEN 7 THEN c.saturday
            END = 1
      UNION
      SELECT cd.service_id
      FROM calendar_dates cd, today t
      WHERE cd.date = t.d AND cd.exception_type = 1
      EXCEPT
      SELECT cd.service_id
      FROM calendar_dates cd, today t
      WHERE cd.date = t.d AND cd.exception_type = 2
    ),
    upcoming AS (
      SELECT st.trip_id, st.arrival_time, st.departure_time
      FROM stop_times st
      JOIN trips tr ON tr.trip_id = st.trip_id
      WHERE tr.agency = $1
        AND st.stop_id = $2
        AND tr.service_id IN (SELECT service_id FROM active_services)
        AND (st.arrival_time >= (extract(epoch from now()) - date_trunc('day', now())::timestamp AT TIME ZONE 'UTC') OR
             st.departure_time >= (extract(epoch from now()) - date_trunc('day', now())::timestamp AT TIME ZONE 'UTC'))
    )
    SELECT u.trip_id,
           u.arrival_time, u.departure_time,
           tr.route_id, tr.trip_headsign
    FROM upcoming u
    JOIN trips tr ON tr.trip_id = u.trip_id
    ORDER BY COALESCE(u.arrival_time, u.departure_time)
    LIMIT $3
  `, [agencyKey.toUpperCase(), String(stopId), limit]);

  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const toIso = (sec) => new Date(startOfDay.getTime() + (Number(sec) * 1000)).toISOString();

  return r.map(row => ({
    when: toIso(row.arrival_time ?? row.departure_time),
    realtime: false,
    routeShortName: row.route_id,
    headsign: row.trip_headsign || '',
  }));
}

