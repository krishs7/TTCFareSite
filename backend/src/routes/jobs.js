// backend/src/routes/jobs.js
import { Router } from 'express';
import { getPool } from '../db.js';
import { sendEmail } from '../email.js';

const router = Router();

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
function emailTo(phoneE164, carrierRaw) {
  const key = keyForCarrier(carrierRaw);
  const dom = GATEWAYS[key];
  if (!dom) throw new Error(`Unsupported carrier: ${carrierRaw}`);
  return `${local10(phoneE164)}@${dom}`;
}

/**
 * Run due SMS jobs once. Safe to call repeatedly.
 * - Selects due jobs with SKIP LOCKED
 * - Sends via email-to-SMS
 * - Marks sent/failed
 */
export async function runDueSmsJobs(limit = 100) {
  const pool = getPool();
  if (!pool) throw new Error('DB not configured');

  const client = await pool.connect();
  const sent = [];
  try {
    await client.query('BEGIN');

    const { rows: jobs } = await client.query(
      `SELECT j.id, j.recipient_id, j.body, j.url, j.kind,
              r.phone_e164, r.carrier
         FROM sms_reminder_jobs j
         JOIN sms_recipients r ON r.id = j.recipient_id
        WHERE j.sent_at IS NULL
          AND j.failed_at IS NULL
          AND j.fire_at <= NOW()
        ORDER BY j.fire_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [limit]
    );

    for (const job of jobs) {
      const to = emailTo(job.phone_e164, job.carrier);
      const text = job.url ? `${job.body} ${job.url}` : job.body;

      try {
        await sendEmail(to, 'One-Fare', text);
        await client.query(
          `UPDATE sms_reminder_jobs SET sent_at = NOW(), error = NULL WHERE id = $1`,
          [job.id]
        );
        sent.push(job.id);
      } catch (e) {
        await client.query(
          `UPDATE sms_reminder_jobs SET failed_at = NOW(), error = $2 WHERE id = $1`,
          [job.id, String(e)]
        );
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { processed: sent.length, ids: sent };
}

// --- HTTP endpoint (kept) ---
router.post('/run', async (_req, res) => {
  try {
    const r = await runDueSmsJobs();
    res.json({ ok: true, processed: r.processed, smsSent: r.ids });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;

