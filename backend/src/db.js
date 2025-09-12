// backend/src/db.js
import fs from 'fs';
import pkg from 'pg';
const { Pool } = pkg;

let pool = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  const cfg = {
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 5),
  };

  // SSL config: prefer explicit CA path, then CA contents, else default TLS
  const caPath = process.env.DATABASE_CA_CERT_PATH;
  const caText = process.env.DATABASE_CA_CERT;

  if (caPath && fs.existsSync(caPath)) {
    cfg.ssl = { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  } else if (caText) {
    cfg.ssl = { ca: caText, rejectUnauthorized: true };
  } else {
    // Fall back to TLS without explicit CA; useful if the system trust store contains ISRG Root
    // and your DATABASE_URL includes sslmode=require/verify-full.
    cfg.ssl = { rejectUnauthorized: false };
  }

  pool = new Pool(cfg);
  pool.on('error', (err) => console.error('[db] idle client error', err));
  return pool;
}

