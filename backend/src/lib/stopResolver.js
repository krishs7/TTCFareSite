// backend/src/lib/stopResolver.js
import { getPool } from '../db.js';

/**
 * If the user typed a raw id-ish token (digits / letters / _ -), trust it.
 */
export async function getStopId(agencyKey, stopRef) {
  if (!stopRef) return null;
  const s = String(stopRef).trim();

  // Looks like a stop_id already? Just pass it through.
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;

  const pool = getPool();
  if (!pool) return null;

  const ag = String(agencyKey || '').toUpperCase();
  const candidates = await findCandidateStopIds(agencyKey, s, 8);

  // Prefer platform-y rows if the query mentions "station"
  const wantsStationish = /\bstation\b/i.test(s);
  if (candidates.length) {
    if (wantsStationish) {
      candidates.sort(scoreStationQuery);
      return candidates[0].id;
    }
    return candidates[0].id;
  }
  return null;
}

/**
 * Return up to `max` candidate stop_ids by name for this agency.
 * Token-aware filter so "Warden Station" won’t match "Warden Ave".
 */
export async function findCandidateStopIds(agencyKey, nameLike, max = 12) {
  const q = String(nameLike || '').trim();
  if (!q) return [];

  const pool = getPool();
  if (!pool) return [];

  const ag = String(agencyKey || '').toUpperCase();

  // Pull a generous set and score in JS for token quality
  const { rows } = await pool.query(
    `SELECT id, name, coalesce(location_type,0) AS location_type
     FROM stops
     WHERE agency=$1 AND name ILIKE $2
     LIMIT 200`,
    [ag, `%${q}%`]
  );

  // Basic token-aware filtering
  const tokens = q
    .toLowerCase()
    .replace(/[–—-]/g, ' ')   // normalize dashes
    .replace(/\bstn\b/gi, 'station')
    .split(/\s+/)
    .filter(Boolean);

  const filtered = rows.filter(r => {
    const n = String(r.name || '').toLowerCase();
    return tokens.every(t => n.includes(t));
  });

  // Prefer “Platform / Eastbound / Westbound” when the query mentions Station,
  // because TTC platform rows carry stop_times; plain “Station” often does not.
  const wantsStationish = tokens.includes('station');
  const scored = filtered
    .map(r => ({ ...r, _score: wantsStationish ? stationScore(r) : defaultScore(r, q) }))
    .sort((a, b) => b._score - a._score || String(a.name).localeCompare(String(b.name)));

  return scored.slice(0, max).map(r => ({ id: String(r.id), name: String(r.name) }));
}

// ---------- scoring helpers ----------
function stationScore(r) {
  const name = String(r.name || '').toLowerCase();
  let s = 0;
  if (/\bplatform\b/.test(name)) s += 5;
  if (/\b(east|west|north|south)bound\b/.test(name)) s += 3;
  if (/\bplatform\b/.test(name) && /\b(east|west)bound\b/.test(name)) s += 2;
  // nudge non-station rows (GTFS location_type=1 is station)
  if (Number(r.location_type) !== 1) s += 1;
  return s;
}
function defaultScore(r, q) {
  const name = String(r.name || '');
  // simple closeness: shorter and starts-with get a nudge
  let s = 0;
  if (name.toLowerCase().startsWith(q.toLowerCase())) s += 2;
  s += Math.max(0, 40 - Math.abs(name.length - q.length)) / 40;
  return s;
}
function scoreStationQuery(a, b) { return stationScore(b) - stationScore(a); }

