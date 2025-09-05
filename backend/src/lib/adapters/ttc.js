// backend/src/lib/adapters/ttc.js
import { fetchRT, arrivalsFromTripUpdates, alertsFromFeed } from './base.js';

const urls = {
  vehicles: process.env.TTC_RT_VEHICLES || 'https://bustime.ttc.ca/gtfsrt/vehicles',
  trips:    process.env.TTC_RT_TRIPS    || 'https://bustime.ttc.ca/gtfsrt/trips',
  alerts:   process.env.TTC_RT_ALERTS   || 'https://bustime.ttc.ca/gtfsrt/alerts',
};

export const ttc = {
  async nextArrivalsByStop(stopId, { limit = 3 } = {}) {
    const feed = await fetchRT(urls.trips);
    return arrivalsFromTripUpdates(feed, stopId, { limit });
  },
  async alerts(routeRef) {
    const feed = await fetchRT(urls.alerts);
    return alertsFromFeed(feed, { routeRef });
  },
};

