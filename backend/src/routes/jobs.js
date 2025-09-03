// backend/src/routes/jobs.js
import { Router } from 'express';
import { getPool } from '../db.js';
import { sendEmail } from '../email.js';

export const router = Router();

// Same gateway map as sms.js
const GATEWAYS = {
  bell:          'txt.bell.ca',
  telus:         'msg.telus.com',
  publicmobile:  'msg.telus.com',
  rogers:        'pcs.rogers.com',
  freedom:       'txt.freedommobile.ca',
};

function keyForCarrier(raw = '') {
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
}
function local10(phoneE164) {
  const digits = (phoneE164 || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}
function addrFor(phoneE164, carrierRaw) {
  const key = keyForCarrier(carrierRaw);
  const dom = GATEWAYS[key];
  if (!dom) throw new Error(`Unsupported carrier: ${carrierRaw}`);
  return `${local10(phoneE164)}@${dom}`;
}

// Named export used by the background loop and /api/jobs/run
export async function runDueSmsJobs() {
  const pool = getPool();
  if (!pool) return { processed: 0, ids: [] };

  const { rows } = await pool.query(
    `SELECT j.id, j.recipient_id, j.kind, j.body, j.url,
            r.phone_e164, r.carrier
       FROM sms_reminder_jobs j
       JOIN sms_recipients r ON r.id = j.recipient_id
      WHERE j.sent_at IS NULL
        AND j.failed_at IS NULL
        AND j.fire_at <= NOW()
      ORDER BY j.fire_at ASC
      LIMIT 50;`
  );

  if (!rows.length) return { processed: 0, ids: [] };

  const client = await pool.connect();
  const sentIds = [];
  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const to = addrFor(row.phone_e164, row.carrier);

      // Compose strictly plain text; if url is present (legacy rows), append.
      const text = row.url ? `${row.body} ${row.url}` : row.body;

      try {
        await sendEmail(to, 'One-Fare', text);
        await client.query(
          `UPDATE sms_reminder_jobs SET sent_at = NOW(), error = NULL WHERE id = $1`,
          [row.id]
        );
        sentIds.push(row.id);
      } catch (e) {
        await client.query(
          `UPDATE sms_reminder_jobs SET failed_at = NOW(), error = $2 WHERE id = $1`,
          [row.id, String(e)]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { processed: sentIds.length, ids: sentIds };
}

// --- HTTP endpoint to run the queue on demand ---
router.post('/run', async (_req, res) => {
  try {
    const r = await runDueSmsJobs();
    res.json({ ok: true, processed: r.processed, smsSent: r.ids });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;

