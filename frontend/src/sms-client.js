// src/sms-client.js
import { API_BASE } from './apiBase.js';

const LS_KEY = 'sms_recipient_id';

// ----- tiny helpers -----
async function parseOkOrThrow(res) {
  // Read the body exactly once.
  if (!res.ok) {
    let msg = '';
    try { msg = await res.text(); } catch { /* ignore */ }
    // Provide a concise error message for UI.
    throw new Error(msg || `HTTP ${res.status}`);
  }
  // Many endpoints return JSON; some may return {ok:true} or nothing.
  // If there's no body, this will throw, so guard it:
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function assertE164(phone) {
  if (!/^\+[1-9]\d{1,14}$/.test(String(phone))) {
    throw new Error('Phone must be E.164 (e.g., +16475551234)');
  }
}

// ----- public API used by Tool.jsx -----

export function getSmsRecipientId() {
  try { return localStorage.getItem(LS_KEY) || null; } catch { return null; }
}

export async function startSmsVerification(phoneE164, carrier) {
  assertE164(phoneE164);
  // Build a fresh Request every time (never reuse).
  const res = await fetch(`${API_BASE}/api/sms/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: phoneE164, carrier })
  });
  await parseOkOrThrow(res);
  return true;
}

export async function verifySmsCode(phoneE164, code) {
  assertE164(phoneE164);
  const res = await fetch(`${API_BASE}/api/sms/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: phoneE164, code })
  });
  const data = await parseOkOrThrow(res);
  const id = data?.id;
  if (!id) throw new Error('Verification failed');
  try { localStorage.setItem(LS_KEY, id); } catch { /* ignore */ }
  return id;
}

export async function scheduleSmsReminders(deadlineISO) {
  const recipientId = getSmsRecipientId();
  if (!recipientId) return; // silently skip if not enrolled
  const res = await fetch(`${API_BASE}/api/sms/reminders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipientId, deadlineISO })
  });
  await parseOkOrThrow(res);
  return true;
}

