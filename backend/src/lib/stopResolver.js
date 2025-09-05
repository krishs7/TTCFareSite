// backend/src/lib/stopResolver.js
import { getPool } from '../db.js';

export async function getStopId(agencyKey, stopRef) {
  // If caller passed an exact stop_id, trust it.
  if (/^[A-Za-z0-9_-]+$/.test(String(stopRef))) return String(stopRef);

  const pool = getPool();
  if (!pool) return null;
  const q = String(stopRef || '').trim();
  if (!q) return null;

  // Prefer exact stop_code/id match (if your stops table had stop_code, you could add it here)
  // Fallback to ILIKE name search within agency.
  const { rows } = await pool.query(
    `SELECT id FROM stops WHERE agency = $1 AND name ILIKE $2 ORDER BY name ASC LIMIT 1`,
    [agencyKey.toUpperCase(), `%${q}%`]
  );
  return rows[0]?.id || null;
}

