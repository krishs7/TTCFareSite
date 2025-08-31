// backend/src/routes/jobs.js
import { Router } from 'express';
import { getPool } from '../db.js';
import webpush from 'web-push';

const router = Router();

function configureVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || 'mailto:you@example.com';
  if (!pub || !priv) throw new Error('VAPID keys missing');
  webpush.setVapidDetails(sub, pub, priv);
}

router.post('/run', async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(501).json({ error: 'Jobs not configured (no DATABASE_URL).' });

  try { configureVapid(); } catch (e) { return res.status(500).json({ error: e.message }); }

  // Fetch due jobs (limit to keep it safe)
  const { rows: jobs } = await pool.query(`
    SELECT j.id, j.kind, j.payload, s.endpoint, s.p256dh, s.auth
    FROM reminder_jobs j
    JOIN push_subscriptions s ON s.id = j.subscription_id
    WHERE j.sent_at IS NULL AND j.failed_at IS NULL AND j.fire_at <= now()
    ORDER BY j.fire_at ASC
    LIMIT 100;
  `);

  let sent = 0;

  for (const job of jobs) {
    const subscription = {
      endpoint: job.endpoint,
      keys: { p256dh: job.p256dh, auth: job.auth }
    };
    const payload = JSON.stringify(job.payload || { title: 'One-Fare', body: 'Reminder', url: '/tool' });

    try {
      await webpush.sendNotification(subscription, payload);
      await pool.query(`UPDATE reminder_jobs SET sent_at = now() WHERE id = $1`, [job.id]);
      sent++;
    } catch (e) {
      // if endpoint is gone, delete sub; mark failure
      const gone = e?.statusCode === 404 || e?.statusCode === 410;
      if (gone) {
        await pool.query(`UPDATE reminder_jobs SET failed_at = now(), error = $2 WHERE id = $1`, [job.id, String(e)]);
      } else {
        await pool.query(`UPDATE reminder_jobs SET failed_at = now(), error = $2 WHERE id = $1`, [job.id, String(e)]);
      }
    }
  }

  res.json({ ok: true, processed: jobs.length, sent });
});

export default router;

