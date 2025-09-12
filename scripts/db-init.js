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
  try { await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`); } catch {}
  try { await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`); } catch {}

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

  // --- SMS recipients (Email-to-SMS) ---
  await client.query(`
    CREATE TABLE IF NOT EXISTS sms_recipients (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_e164       TEXT UNIQUE NOT NULL,
      carrier          TEXT NOT NULL,
      verified_at      TIMESTAMPTZ,
      pending_code     TEXT,
      pending_expires  TIMESTAMPTZ,
      opt_out_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS sms_verified_idx
      ON sms_recipients (phone_e164)
      WHERE verified_at IS NOT NULL AND opt_out_at IS NULL;
  `);

  // --- SMS reminder jobs (Email-to-SMS) ---
  await client.query(`
    CREATE TABLE IF NOT EXISTS sms_reminder_jobs (
      id             BIGSERIAL PRIMARY KEY,
      recipient_id   UUID NOT NULL REFERENCES sms_recipients(id) ON DELETE CASCADE,
      fire_at        TIMESTAMPTZ NOT NULL,
      kind           TEXT NOT NULL CHECK (kind IN ('T_MINUS_5','T_MINUS_1','T_MINUS_115')),
      body           TEXT NOT NULL,
      url            TEXT,
      sent_at        TIMESTAMPTZ,
      failed_at      TIMESTAMPTZ,
      error          TEXT
    );
  `);
  // If table already existed with the older CHECK, widen it to include T_MINUS_115
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='sms_reminder_jobs'
          AND constraint_name='sms_reminder_jobs_kind_check'
      ) THEN
        ALTER TABLE sms_reminder_jobs
          DROP CONSTRAINT sms_reminder_jobs_kind_check,
          ADD CONSTRAINT sms_reminder_jobs_kind_check
          CHECK (kind IN ('T_MINUS_5','T_MINUS_1','T_MINUS_115'));
      END IF;
    END$$;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS sms_reminder_due_idx
      ON sms_reminder_jobs (fire_at)
      WHERE sent_at IS NULL AND failed_at IS NULL;
  `);

  // --- push_subscriptions & reminder_jobs (unchanged; can stay for future push) ---
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

  const { rows: idInfo } = await client.query(`
    SELECT data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'id'
    LIMIT 1;
  `);
  const idType = (idInfo[0]?.data_type || 'text').toLowerCase();
  const idHasDefault = !!idInfo[0]?.column_default;
  if (!idHasDefault) {
    if (idType === 'uuid') {
      await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();`);
    } else {
      await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;`);
    }
  }

  const { rows: devInfo } = await client.query(`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'device_id'
    LIMIT 1;
  `);

  if (devInfo.length === 0) {
    if (idType === 'uuid') {
      await client.query(`ALTER TABLE push_subscriptions ADD COLUMN device_id UUID NOT NULL DEFAULT gen_random_uuid();`);
    } else {
      await client.query(`ALTER TABLE push_subscriptions ADD COLUMN device_id TEXT NOT NULL DEFAULT gen_random_uuid()::text;`);
    }
  } else {
    const devType = devInfo[0].data_type.toLowerCase();
    const devHasDefault = !!devInfo[0]?.column_default;
    const devIsNullable = devInfo[0]?.is_nullable === 'YES';

    if (!devHasDefault) {
      if (devType === 'uuid') {
        await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN device_id SET DEFAULT gen_random_uuid();`);
      } else {
        await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN device_id SET DEFAULT gen_random_uuid()::text;`);
      }
    }
    if (devType === 'uuid') {
      await client.query(`UPDATE push_subscriptions SET device_id = gen_random_uuid() WHERE device_id IS NULL;`);
    } else {
      await client.query(`UPDATE push_subscriptions SET device_id = gen_random_uuid()::text WHERE device_id IS NULL;`);
    }
    if (devIsNullable) {
      await client.query(`ALTER TABLE push_subscriptions ALTER COLUMN device_id SET NOT NULL;`);
    }
  }

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

