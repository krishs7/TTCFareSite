// scripts/db-init.js
import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');

  const client = new Client({ connectionString: url });
  await client.connect();

  // Extensions (Neon supports these)
  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`); // gen_random_uuid()

  // --- stops (unchanged) ---
  await client.query(`
    CREATE TABLE IF NOT EXISTS stops (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lat  DOUBLE PRECISION NOT NULL,
      lon  DOUBLE PRECISION NOT NULL,
      agency TEXT NOT NULL
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS stops_name_trgm
      ON stops USING gin (name gin_trgm_ops);
  `);

  // --- push_subscriptions ---
  await client.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      endpoint    TEXT UNIQUE NOT NULL,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL,
      user_agent  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_agent TEXT;`);

  // Ensure id has a DEFAULT (older DBs may have none)
  const { rows: idInfo } = await client.query(`
    SELECT data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'id'
    LIMIT 1;
  `);
  const idType = (idInfo[0]?.data_type || 'text').toLowerCase();     // 'uuid' | 'text'
  const idHasDefault = !!idInfo[0]?.column_default;
  if (!idHasDefault) {
    if (idType === 'uuid') {
      await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();`);
    } else {
      await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;`);
    }
  }

  // Ensure device_id exists and is usable for inserts
  const { rows: devInfo } = await client.query(`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'device_id'
    LIMIT 1;
  `);

  if (devInfo.length === 0) {
    // Add device_id with a DEFAULT; use same family as idType
    if (idType === 'uuid') {
      await client.query(`ALTER TABLE push_subscriptions ADD COLUMN device_id UUID NOT NULL DEFAULT gen_random_uuid();`);
    } else {
      await client.query(`ALTER TABLE push_subscriptions ADD COLUMN device_id TEXT NOT NULL DEFAULT gen_random_uuid()::text;`);
    }
  } else {
    const devType = devInfo[0].data_type.toLowerCase();               // 'uuid' | 'text' | etc.
    const devHasDefault = !!devInfo[0]?.column_default;
    const devIsNullable = devInfo[0]?.is_nullable === 'YES';

    // Set a DEFAULT if missing
    if (!devHasDefault) {
      if (devType === 'uuid') {
        await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN device_id SET DEFAULT gen_random_uuid();`);
      } else {
        await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN device_id SET DEFAULT gen_random_uuid()::text;`);
      }
    }
    // Backfill any NULLs so we can enforce NOT NULL
    if (devType === 'uuid') {
      await client.query(`UPDATE push_subscriptions SET device_id = gen_random_uuid() WHERE device_id IS NULL;`);
    } else {
      await client.query(`UPDATE push_subscriptions SET device_id = gen_random_uuid()::text WHERE device_id IS NULL;`);
    }
    // Enforce NOT NULL if currently nullable
    if (devIsNullable) {
      await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN device_id SET NOT NULL;`);
    }
  }

  // --- reminder_jobs (FK type matched to push_subscriptions.id) ---
  const fkType = idType === 'uuid' ? 'UUID' : 'TEXT';
  await client.query(`
    CREATE TABLE IF NOT EXISTS reminder_jobs (
      id               BIGSERIAL PRIMARY KEY,
      subscription_id  ${fkType} NOT NULL
        REFERENCES push_subscriptions(id) ON DELETE CASCADE,
      fire_at          TIMESTAMPTZ NOT NULL,
      kind             TEXT NOT NULL CHECK (kind IN ('T_MINUS_5','T_MINUS_1')),
      payload          JSONB,
      sent_at          TIMESTAMPTZ,
      failed_at        TIMESTAMPTZ,
      error            TEXT
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS reminder_due_idx
      ON reminder_jobs (fire_at)
      WHERE sent_at IS NULL AND failed_at IS NULL;
  `);

  console.log('DB initialized successfully.');
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

