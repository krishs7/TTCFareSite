import { DATABASE_URL } from './config.js';
import pkg from 'pg';
const { Pool } = pkg;

let pool = null;

export function getPool() {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 4,
      idleTimeoutMillis: 10000
    });
  }
  return pool;
}

