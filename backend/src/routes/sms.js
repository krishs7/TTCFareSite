// backend/src/routes/sms.js
import express, { Router } from 'express';
import { getPool } from '../db.js';
import { sendEmail } from '../email.js';

const router = Router();
const { SMS_TEST_API } = process.env;

// Canada-focused gateways (best-effort; carriers may retire/filter)
const GATEWAYS = {
  bell:          'txt.bell.ca',        // EOL Dec 31, 2025 (may degrade)
  telus:         'msg.telus.com',      // URLs frequently filtered
  publicmobile:  'msg.telus.com',      // same platform as TELUS
  rogers:        'pcs.rogers.com',
  freedom:       'txt.freedommobile.ca',
};

function keyForCarrier(raw = '') {
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
}
function isE164(s = '') {
  return /^\+[1-9]\d{1,14}$/.test(s.trim());
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
async function sendSmsLike(phoneE164, carrierRaw, text) {
  const to = addrFor(phoneE164, carrierRaw);
  return sendEmail(to, 'One-Fare', text);
}

// POST /api/sms/start  { phone, carrier }
router.post('/start', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(501).json({ error: 'DB not configured' });

  const { phone, carrier } = req.body || {};
  if (!isE164(phone)) return res.status(400).json({ error: 'phone must be E.164 (e.g., +16475551234)' });

  const key = keyForCarrier(carrier);
  if (!GATEWAYS[key]) return res.status(400).json({ error: 'unsupported carrier' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `INSERT INTO sms_recipients (phone_e164, carrier, pending_code, pending_expires, verified_at, opt_out_at)
     VALUES ($1, $2, $3, $4, NULL, NULL)
     ON CONFLICT (phone_e164)
     DO UPDATE SET
       carrier = EXCLUDED.carrier,
       pending_code = EXCLUDED.pending_code,
       pending_expires = EXCLUDED.pending_expires,
       opt_out_at = NULL;`,
    [phone, key, code, expires]
  );

  const stop = 'Reply STOP to opt out (if supported by your carrier).';
  await sendSmsLike(phone, key, `One-Fare code: ${code}. Expires in 10 min. ${stop}`);
  res.json({ ok: true });
});

// POST /api/sms/verify  { phone, code }
router.post('/verify', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(501).json({ error: 'DB not configured' });

  const { phone, code } = req.body || {};
  if (!isE164(phone) || !/^\d{6}$/.test(String(code || ''))) {
    return res.status(400).json({ error: 'invalid' });
  }

  const { rows } = await pool.query(
    `UPDATE sms_recipients
        SET verified_at = NOW(),
            pending_code = NULL,
            pending_expires = NULL
      WHERE phone_e164 = $1
        AND pending_code = $2
        AND pending_expires > NOW()
        AND opt_out_at IS NULL
      RETURNING id;`,
    [phone, String(code)]
  );

  if (!rows.length) return res.status(400).json({ error: 'Invalid or expired code' });
  res.json({ id: rows[0].id });
});

// POST /api/sms/reminders  { recipientId, deadlineISO }
router.post('/reminders', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(501).json({ error: 'DB not configured' });

  const { recipientId, deadlineISO } = req.body || {};
  if (!recipientId || !deadlineISO) {
    return res.status(400).json({ error: 'recipientId and deadlineISO required' });
  }

  const { rows: ok } = await pool.query(
    `SELECT phone_e164, carrier
       FROM sms_recipients
      WHERE id = $1
        AND verified_at IS NOT NULL
        AND opt_out_at IS NULL
      LIMIT 1;`,
    [recipientId]
  );
  if (!ok.length) return res.status(400).json({ error: 'recipient not verified' });

  // Normalize and validate the deadline
  const dl = new Date(deadlineISO);
  if (isNaN(dl.getTime())) return res.status(400).json({ error: 'deadlineISO invalid' });

  const minus = (min) => new Date(dl.getTime() - min * 60 * 1000);
  const at115 = minus(115); // 1h55m before
  const at5   = minus(5);
  const at1   = minus(1);

  // Plain-text bodies (no links) for maximum deliverability
  const body115 = 'One-Fare: 1h 55m remaining on your transfer window.';
  const body5   = 'One-Fare: 5 minutes left. Keep your discount.';
  const body1   = 'One-Fare: 1 minute left. Window expiring.';

  await pool.query(
    `INSERT INTO sms_reminder_jobs (recipient_id, fire_at, kind, body, url)
     VALUES
       ($1, $2, 'T_MINUS_115', $3, NULL),
       ($1, $4, 'T_MINUS_5',   $5, NULL),
       ($1, $6, 'T_MINUS_1',   $7, NULL);`,
    [recipientId, at115, body115, at5, body5, at1, body1]
  );

  res.json({ ok: true, scheduled: [at115, at5, at1] });
});

/**
 * TEST-ONLY: POST /api/sms/reminders/test  { recipientId, offsetsSec: [..] }
 * Keeps allowed kinds while letting you set small offsets for fast tests.
 * Enable with SMS_TEST_API=true
 */
router.post('/reminders/test', async (req, res) => {
  if (SMS_TEST_API !== 'true') return res.status(404).end();

  const pool = getPool(); if (!pool) return res.status(501).json({ error: 'DB not configured' });

  const { recipientId, offsetsSec } = req.body || {};
  if (!recipientId || !Array.isArray(offsetsSec) || offsetsSec.length === 0) {
    return res.status(400).json({ error: 'recipientId and offsetsSec[] required' });
  }

  const ok = await pool.query(
    `SELECT 1 FROM sms_recipients WHERE id=$1 AND verified_at IS NOT NULL AND opt_out_at IS NULL LIMIT 1`,
    [recipientId]
  );
  if (!ok.rowCount) return res.status(400).json({ error: 'recipient not verified' });

  const now = Date.now();
  const kinds = ['T_MINUS_115', 'T_MINUS_5', 'T_MINUS_1'];
  const rows = offsetsSec.slice(0, 3).map((s, i) => ({
    fireAt: new Date(now + Number(s) * 1000),
    kind: kinds[i] || 'T_MINUS_1'
  }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO sms_reminder_jobs (recipient_id, fire_at, kind, body, url)
         VALUES ($1,$2,$3,$4,$5);`,
        [recipientId, r.fireAt, r.kind, 'One-Fare (test): incoming shortly.', NULL]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally {
    client.release();
  }

  res.json({ ok: true, scheduled: rows.map(r => r.fireAt) });
});

export default router;

