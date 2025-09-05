// backend/src/routes/chat.js
import { Router } from 'express';
import { normalizeAgency } from '../lib/adapters/index.js';

const router = Router();

// Very simple deterministic parser (MVP)
router.post('/parse', (req, res) => {
  const text = String((req.body?.text || '')).toLowerCase();
  const sessionId = String(req.body?.sessionId || '');

  // intent
  let intent = null;
  if (/\b(arrival|next|when|coming)\b/.test(text)) intent = 'arrivals';
  else if (/\b(alert|delay|advisory|disruption)\b/.test(text)) intent = 'alerts';
  else if (/\b(route|where.*go|termini|stops)\b/.test(text)) intent = 'route'; // placeholder

  // agency
  let agency = null;
  for (const a of ['ttc','toronto','miway','mississauga','brampton','drt','durham','yrt','york']) {
    if (text.includes(a)) { agency = normalizeAgency(a); break; }
  }

  // stop or route refs (basic)
  const stopMatch = text.match(/\bstop\s+(\d+)\b/) || text.match(/at\s+([a-z0-9 &'-]+)/i);
  const routeMatch = text.match(/\b(?:route|line)\s+([a-z0-9-]+)\b/) || text.match(/\b(\d{2,3}[a-z]?)\b/);

  const slots = {};
  if (agency) slots.agency = agency;
  if (stopMatch) slots.stop_ref = stopMatch[1];
  if (routeMatch && !slots.stop_ref) slots.route_ref = routeMatch[1];

  // ask for missing slots
  const missing = [];
  if (!intent) missing.push('intent');
  if (intent === 'arrivals' && !slots.stop_ref) missing.push('stop_ref');
  if (!slots.agency) missing.push('agency');

  res.json({ intent, slots, missingSlots: missing, sessionId });
});

export default router;

