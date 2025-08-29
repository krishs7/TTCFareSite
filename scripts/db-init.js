// scripts/db-init.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Populate backend/.env first.');
  process.exit(1);
}

const sql = `
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  agency TEXT NOT NULL
);

-- fast ILIKE lookups
CREATE INDEX IF NOT EXISTS stops_name_idx ON stops (name);

-- fuzzy search if pg_trgm available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS stops_name_trgm_idx ON stops USING gin (name gin_trgm_ops);
  END IF;
END$$;
`;

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('DB initialized successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

