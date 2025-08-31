// backend/src/routes/push.js
import { Router } from 'express';
import { getPool } from '../db.js';
const router = Router();

router.get('/public-key', (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

router.post('/subscribe', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(501).json({ error: 'Push not configured (no DATABASE_URL).' });

  const { subscription, userAgent } = req.body || {};
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  const { endpoint, keys } = subscription;
  const { p256dh, auth } = keys;

  const { rows } = await pool.query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET user_agent = EXCLUDED.user_agent
     RETURNING id;`,
    [endpoint, p256dh, auth, userAgent?.slice(0,255) || null]
  );
  return res.json({ id: rows[0].id });
});

router.delete('/subscribe/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(501).json({ error: 'Push not configured (no DATABASE_URL).' });
  await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;

