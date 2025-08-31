// backend/src/routes/reminders.js
import { Router } from 'express';
import { getPool } from '../db.js';
import dayjs from 'dayjs';

const router = Router();

router.post('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(501).json({ error: 'Reminders not configured (no DATABASE_URL).' });

  const { subscriptionId, deadlineISO } = req.body || {};
  if (!subscriptionId || !deadlineISO) return res.status(400).json({ error: 'subscriptionId and deadlineISO required' });
  // Guard: ensure subscription exists to avoid FK errors
  const { rows: subRows } = await pool.query(
    `SELECT 1 FROM push_subscriptions WHERE id = $1 LIMIT 1`, [subscriptionId]
  );
  if (subRows.length === 0) {
    return res.status(400).json({ error: 'Unknown subscriptionId' });
  }
  const deadline = dayjs(deadlineISO);
  if (!deadline.isValid()) return res.status(400).json({ error: 'Invalid deadlineISO' });

  const five = deadline.subtract(5, 'minute').toISOString();
  const one  = deadline.subtract(1, 'minute').toISOString();

  const payload5 = { title: 'One-Fare: 5 minutes left', body: 'Tap soon to keep your discount.', url: '/tool' };
  const payload1 = { title: 'One-Fare: 1 minute left', body: 'Tap before your window expires.', url: '/tool' };

  await pool.query(
    `INSERT INTO reminder_jobs (subscription_id, fire_at, kind, payload)
     VALUES ($1,$2,'T_MINUS_5',$3), ($1,$4,'T_MINUS_1',$5);`,
    [subscriptionId, five, payload5, one, payload1]
  );

  res.json({ ok: true, scheduled: [five, one] });
});

export default router;

