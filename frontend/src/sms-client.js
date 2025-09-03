// src/sms-client.js
import { API_BASE } from './apiBase.js';

// Build a per-origin storage key so switching servers never reuses IDs
function apiOrigin() {
  try { return new URL(API_BASE).origin; } catch { return String(API_BASE || '').trim(); }
}
const NEW_KEY = `sms_recipient_id:${apiOrigin()}`;
const OLD_KEY = 'sms_recipient_id'; // backward-compat read

function readStoredId() {
  try {
    return localStorage.getItem(NEW_KEY) || localStorage.getItem(OLD_KEY) || null;
  } catch {
    return null;
  }
}
function writeStoredId(id) {
  try {
    localStorage.setItem(NEW_KEY, id);
    if (localStorage.getItem(OLD_KEY)) localStorage.removeItem(OLD_KEY);
  } catch {}
}
export function clearSmsRecipientId() {
  try {
    localStorage.removeItem(NEW_KEY);
    localStorage.removeItem(OLD_KEY);
  } catch {}
}

// ---------- tiny helpers ----------
async function parseOkOrThrow(res) {
  const text = await res.text(); // read exactly once
  if (!res.ok) {
    // try to extract a small JSON error or fall back to text
    let msg = '';
    try { msg = JSON.parse(text)?.error; } catch {}
    throw new Error(msg || text || `HTTP ${res.status}`);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function assertE164(phone) {
  if (!/^\+[1-9]\d{1,14}$/.test(String(phone))) {
    throw new Error('Phone must be E.164 (e.g., +16475551234)');
  }
}

// ---------- public API used by Tool.jsx ----------
export function getSmsRecipientId() {
  return readStoredId();
}

export async function startSmsVerification(phoneE164, carrier) {
  assertE164(phoneE164);
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
  writeStoredId(id);
  return id;
}

export async function scheduleSmsReminders(deadlineISO) {
  const recipientId = getSmsRecipientId();
  if (!recipientId) throw new Error('Please enable SMS alerts first.');

  const res = await fetch(`${API_BASE}/api/sms/reminders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipientId, deadlineISO })
  });

  try {
    await parseOkOrThrow(res);
    return true;
  } catch (e) {
    const msg = String(e.message || e);
    // If this backend doesn't recognize the stored id, clear it and guide the user
    if (/recipient not verified/i.test(msg) || /unknown/i.test(msg)) {
      clearSmsRecipientId();
      throw new Error('For this server, please re-verify your number in “Text alerts (SMS)”.');
    }
    throw e;
  }
}

