// frontend/src/sms-client.js
import { API_BASE } from './apiBase.js';

const KEY = 'sms_recipient_id';

export function getSmsRecipientId() { return localStorage.getItem(KEY); }
export function setSmsRecipientId(id) { localStorage.setItem(KEY, id); }

// Require both phone (E.164) and carrier
export async function startSmsVerification(phoneE164, carrier) {
  const res = await fetch(`${API_BASE}/api/sms/start`, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({ phone: phoneE164, carrier })
  });
  if (!res.ok) {
    let msg;
    try { msg = (await res.json()).error; } catch { msg = await res.text(); }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json(); // { ok: true }
}

export async function verifySmsCode(phoneE164, code) {
  const res = await fetch(`${API_BASE}/api/sms/verify`, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({ phone: phoneE164, code })
  });
  if (!res.ok) {
    let msg;
    try { msg = (await res.json()).error; } catch { msg = await res.text(); }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const data = await res.json(); // { id: '<uuid>' }
  setSmsRecipientId(data.id);
  return data.id;
}

export async function scheduleSmsReminders(deadlineISO) {
  const id = getSmsRecipientId();
  if (!id) return { ok:false, reason:'no-sms' };
  const res = await fetch(`${API_BASE}/api/sms/reminders`, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({ recipientId: id, deadlineISO })
  });
  if (!res.ok) {
    let msg;
    try { msg = (await res.json()).error; } catch { msg = await res.text(); }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json(); // { ok:true, scheduled:[...dates...] }
}

