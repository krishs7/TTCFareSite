// backend/src/lib/adapters/miway.js
import { fetchRT, arrivalsFromTripUpdates, alertsFromFeed } from './base.js';

const urls = {
  vehicles: process.env.MIWAY_RT_VEHICLES || 'https://www.miapp.ca/GTFS_RT/Vehicle/VehiclePositions.pb',
  trips:    process.env.MIWAY_RT_TRIPS    || 'https://www.miapp.ca/GTFS_RT/TripUpdate/TripUpdates.pb',
  alerts:   process.env.MIWAY_RT_ALERTS   || null, // not always present; MiWay typically has alerts feed on portal
};

export const miway = {
  async nextArrivalsByStop(stopId, { limit = 3 } = {}) {
    const feed = await fetchRT(urls.trips);
    return arrivalsFromTripUpdates(feed, stopId, { limit });
  },
  async alerts(_routeRef) {
    if (!urls.alerts) return [];
    const feed = await fetchRT(urls.alerts);
    return alertsFromFeed(feed, { routeRef: _routeRef });
  },
};

