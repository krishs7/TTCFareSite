// backend/src/routes/jobs.js
import { Router } from 'express';
import { getPool } from '../db.js';
import { sendEmail } from '../email.js';

const router = Router();

// Minimal Canadian carrier map for Email->SMS gateways.
// These are best-effort and may change or be rate-limited by carriers.
const GATEWAYS = {
  bell: 'txt.bell.ca',                 // Bell EOL Dec 31, 2025
  telus: 'msg.telus.com',              // limited; URLs often stripped
  rogers: 'pcs.rogers.com',
  freedom: 'txt.freedommobile.ca',
  // publicmobile rides on TELUS:
  publicmobile: 'msg.telus.com',
};

function toLocal10FromE164(e164) {
  // Remove +1 and any non-digits; keep last 10 digits as a safety.
  const digits = (e164 || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

router.post('/run', async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(501).json({ error: 'Jobs not configured (no DATABASE_URL).' });

  try {
    // --- Email-to-SMS jobs only ---
    const { rows: smsJobs } = await pool.query(`
      SELECT j.id, j.kind, j.body, j.url, r.phone_e164, r.carrier
        FROM sms_reminder_jobs j
        JOIN sms_recipients r ON r.id = j.recipient_id
       WHERE j.fire_at <= NOW()
         AND j.sent_at IS NULL
         AND j.failed_at IS NULL
         AND r.verified_at IS NOT NULL
         AND r.opt_out_at IS NULL
       ORDER BY j.fire_at ASC
       LIMIT 100;
    `);

    let smsSent = 0;

    for (const job of smsJobs) {
      try {
        const domain = GATEWAYS[job.carrier];
        if (!domain) throw new Error(`unsupported carrier: ${job.carrier}`);

        const local10 = toLocal10FromE164(job.phone_e164);
        if (!/^\d{10}$/.test(local10)) throw new Error('invalid phone');

        const to = `${local10}@${domain}`;
        const text = job.url ? `${job.body} ${job.url}` : job.body;

        await sendEmail(to, 'One-Fare', text);
        await pool.query(`UPDATE sms_reminder_jobs SET sent_at = NOW() WHERE id = $1`, [job.id]);
        smsSent++;
      } catch (e) {
        await pool.query(
          `UPDATE sms_reminder_jobs SET failed_at = NOW(), error = $2 WHERE id = $1`,
          [job.id, String(e)]
        );
      }
    }

    return res.json({ ok: true, processed: smsJobs.length, smsSent });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;

