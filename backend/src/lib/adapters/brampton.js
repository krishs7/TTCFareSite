// backend/src/lib/adapters/brampton.js
import { fetchRT, arrivalsFromTripUpdates, alertsFromFeed } from './base.js';

const urls = {
  vehicles: process.env.BRAMPTON_RT_VEHICLES || 'https://nextride.brampton.ca:81/API/VehiclePositions?format=gtfs.proto',
  trips:    process.env.BRAMPTON_RT_TRIPS    || 'https://nextride.brampton.ca:81/API/TripUpdates?format=gtfs.proto',
  alerts:   process.env.BRAMPTON_RT_ALERTS   || 'https://nextride.brampton.ca:81/API/ServiceAlerts?format=gtfs.proto',
};

export const brampton = {
  async nextArrivalsByStop(stopId, { limit = 3 } = {}) {
    const feed = await fetchRT(urls.trips);
    return arrivalsFromTripUpdates(feed, stopId, { limit });
  },
  async alerts(routeRef) {
    const feed = await fetchRT(urls.alerts);
    return alertsFromFeed(feed, { routeRef });
  },
};

