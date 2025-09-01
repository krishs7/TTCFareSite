// backend/src/routes/sms.js
import express, { Router } from 'express';
import { getPool } from '../db.js';
import { sendEmail } from '../email.js';

const router = Router();

const { FRONTEND_ORIGIN } = process.env;

// Minimal, Canada-focused gateway map.
// NOTE: These gateways are "best-effort" and some are being retired or filtered.
const GATEWAYS = {
  bell:    'txt.bell.ca',     // Bell sunsets Dec 31, 2025 (see Bell EOL notice)
  telus:   'msg.telus.com',   // Limited; URLs often stripped
  rogers:  'pcs.rogers.com',  // Community reports of issues
  freedom: 'txt.freedommobile.ca', // Often requires enabling; may be unreliable
  // Add others (koodo->msg.telus.com, fido->rogers, etc.) if needed
};

function isE164(s=''){ return /^\+[1-9]\d{1,14}$/.test(s.trim()); }
function local10(phoneE164){ return phoneE164.replace(/^\+?1?/, '').replace(/\D/g,''); } // crude; assumes NANP

function addrFor(phoneE164, carrier) {
  const dom = GATEWAYS[carrier];
  if (!dom) throw new Error(`Unsupported carrier: ${carrier}`);
  return `${local10(phoneE164)}@${dom}`;
}

async function sendSmsLike(phoneE164, carrier, text) {
  const to = addrFor(phoneE164, carrier);
  // Subject is often ignored by gateways; keep it short
  return sendEmail(to, 'One-Fare', text);
}

// POST /api/sms/start  { phone, carrier }
router.post('/start', async (req, res) => {
  const pool = getPool(); if (!pool) return res.status(501).json({ error: 'DB not configured' });

  const { phone, carrier } = req.body || {};
  if (!isE164(phone)) return res.status(400).json({ error: 'phone must be E.164 (e.g., +16475551234)' });
  if (!GATEWAYS[carrier]) return res.status(400).json({ error: 'unsupported carrier' });

  const code = String(Math.floor(100000 + Math.random()*900000));
  const expires = new Date(Date.now()+10*60*1000);

  await pool.query(`
    INSERT INTO sms_recipients (phone_e164, carrier, pending_code, pending_expires, verified_at, opt_out_at)
    VALUES ($1,$2,$3,$4,NULL,NULL)
    ON CONFLICT (phone_e164)
    DO UPDATE SET carrier=EXCLUDED.carrier, pending_code=EXCLUDED.pending_code, pending_expires=EXCLUDED.pending_expires, opt_out_at=NULL;
  `, [phone, carrier, code, expires]);

  const stop = 'Reply STOP to opt out (if supported by your carrier).';
  await sendSmsLike(phone, carrier, `One-Fare code: ${code}. Expires in 10 min. ${stop}`);

  res.json({ ok:true });
});

// POST /api/sms/verify  { phone, code }
router.post('/verify', async (req, res) => {
  const pool = getPool(); if (!pool) return res.status(501).json({ error: 'DB not configured' });
  const { phone, code } = req.body || {};
  if (!isE164(phone) || !/^\d{6}$/.test(String(code||''))) return res.status(400).json({ error:'invalid' });

  const { rows } = await pool.query(`
    UPDATE sms_recipients
       SET verified_at=NOW(), pending_code=NULL, pending_expires=NULL
     WHERE phone_e164=$1 AND pending_code=$2 AND pending_expires>NOW() AND opt_out_at IS NULL
     RETURNING id;
  `, [phone, String(code)]);
  if (!rows.length) return res.status(400).json({ error:'Invalid or expired code' });

  res.json({ id: rows[0].id });
});

// POST /api/sms/reminders  { recipientId, deadlineISO }
router.post('/reminders', async (req, res) => {
  const pool = getPool(); if (!pool) return res.status(501).json({ error: 'DB not configured' });
  const { recipientId, deadlineISO } = req.body || {};
  if (!recipientId || !deadlineISO) return res.status(400).json({ error: 'recipientId and deadlineISO required' });

  const { rows: ok } = await pool.query(
    `SELECT 1 FROM sms_recipients WHERE id=$1 AND verified_at IS NOT NULL AND opt_out_at IS NULL LIMIT 1`, [recipientId]
  );
  if (!ok.length) return res.status(400).json({ error: 'recipient not verified' });

  const dl = new Date(deadlineISO);
  if (isNaN(dl.getTime())) return res.status(400).json({ error:'deadlineISO invalid' });

  const five = new Date(dl.getTime() - 5*60*1000);
  const one  = new Date(dl.getTime() - 1*60*1000);
  const url  = (FRONTEND_ORIGIN ? new URL('/tool', FRONTEND_ORIGIN).toString() : null);

  await pool.query(
    `INSERT INTO sms_reminder_jobs (recipient_id, fire_at, kind, body, url)
     VALUES ($1,$2,'T_MINUS_5',$3,$5), ($1,$4,'T_MINUS_1',$6,$5);`,
    [recipientId, five, 'One-Fare: 5 minutes left. Tap soon to keep your discount.', one, url, 'One-Fare: 1 minute left. Tap before your window expires.']
  );

  res.json({ ok:true, scheduled:[five,one] });
});

// Optional: simple inbound "STOP" handler via email is not feasible here.
// If you later add a real inbound path, call: UPDATE sms_recipients SET opt_out_at=NOW() WHERE phone_e164=...
export default router;

