// backend/src/lib/adapters/base.js

// CJS package → import default, then grab transit_realtime namespace
import GtfsRT from 'gtfs-realtime-bindings';
const TransitRealtime = GtfsRT.transit_realtime;

// Use Node’s built-in fetch (Node 18+)
export async function fetchRT(url, { timeoutMs = 8000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return TransitRealtime.FeedMessage.decode(buf);
  } finally {
    clearTimeout(t);
  }
}

// Common: extract arrivals at a given stopId from a TripUpdates feed
export function arrivalsFromTripUpdates(feed, stopId, { limit = 3 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const out = [];
  for (const ent of feed.entity || []) {
    const tu = ent.tripUpdate;
    if (!tu) continue;
    const trip = tu.trip || {};
    for (const stu of tu.stopTimeUpdate || []) {
      if (String(stu.stopId) !== String(stopId)) continue;
      const t = Number(stu.arrival?.time || stu.departure?.time);
      if (!Number.isFinite(t) || t < now) continue;
      out.push({
        when: new Date(t * 1000).toISOString(),
        realtime: true,
        routeShortName: trip.routeId || '',
        headsign: tu.stopTimeUpdate?.[0]?.stopHeadsign || trip.tripId || '',
        vehicleId: tu.vehicle?.id || undefined,
      });
    }
  }
  out.sort((a, b) => new Date(a.when) - new Date(b.when));
  return out.slice(0, limit);
}

// Alerts helper (maps agency-agnostic fields)
export function alertsFromFeed(feed, { routeRef } = {}) {
  const items = [];
  for (const ent of feed.entity || []) {
    const a = ent.alert;
    if (!a) continue;
    const informed = (a.informedEntity || []).map(e => e.routeId).filter(Boolean);
    if (routeRef && !informed.includes(routeRef)) continue;
    items.push({
      id: ent.id,
      headerText: a.headerText?.translation?.[0]?.text || '',
      descriptionText: a.descriptionText?.translation?.[0]?.text || '',
      cause: a.cause || '',
      effect: a.effect || '',
      routes: informed,
      start: a?.activePeriod?.[0]?.start ? new Date(Number(a.activePeriod[0].start) * 1000).toISOString() : null,
      end: a?.activePeriod?.[0]?.end ? new Date(Number(a.activePeriod[0].end) * 1000).toISOString() : null,
    });
  }
  return items;
}

