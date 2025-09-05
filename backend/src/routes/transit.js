// backend/src/routes/transit.js
import { Router } from 'express';
import { adapters, normalizeAgency } from '../lib/adapters/index.js';
import { getStopId } from '../lib/stopResolver.js';
import { nextArrivalsFromSchedule } from '../lib/schedule.js';

const router = Router();

router.get('/arrivals', async (req, res) => {
  try {
    const agencyKey = normalizeAgency(req.query.agency || '');
    const stopRef = String(req.query.stop_ref || '');
    const limit = Number(req.query.limit || 3);

    if (!agencyKey) return res.status(400).json({ error: 'agency required (ttc, miway, brampton, drt, yrt)' });
    const adapter = adapters[agencyKey];
    if (!adapter) return res.status(400).json({ error: 'unsupported agency' });

    const stopId = await getStopId(agencyKey, stopRef);
    if (!stopId) return res.status(404).json({ error: 'Stop not found' });

    let arrivals = [];
    let source = 'rt';
    try {
      arrivals = await adapter.nextArrivalsByStop(stopId, { limit });
    } catch (e) {
      source = 'schedule';
    }
    if (!arrivals?.length) {
      source = 'schedule';
      arrivals = await nextArrivalsFromSchedule(agencyKey, stopId, { limit });
    }

    return res.json({ agency: agencyKey, stopId, generatedAt: new Date().toISOString(), source, arrivals });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const agencyKey = normalizeAgency(req.query.agency || '');
    const routeRef = (req.query.route_ref || '').toString() || undefined;
    if (!agencyKey) return res.status(400).json({ error: 'agency required' });
    const adapter = adapters[agencyKey];
    if (!adapter?.alerts) return res.json({ items: [] });

    const items = await adapter.alerts(routeRef);
    res.json({ generatedAt: new Date().toISOString(), items });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

export default router;

