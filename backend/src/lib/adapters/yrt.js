// backend/src/lib/adapters/yrt.js
import { fetchRT, arrivalsFromTripUpdates } from './base.js';

// YRT endpoints (note: terms/licence may apply)
const urls = {
  trips:    process.env.YRT_RT_TRIPS    || 'http://rtu.york.ca/gtfsrealtime/TripUpdates',
  vehicles: process.env.YRT_RT_VEHICLES || 'http://rtu.york.ca/gtfsrealtime/VehiclePositions',
};

export const yrt = {
  async nextArrivalsByStop(stopId, { limit = 3 } = {}) {
    const feed = await fetchRT(urls.trips);
    return arrivalsFromTripUpdates(feed, stopId, { limit });
  },
  async alerts() { return []; } // add once a public alerts endpoint is confirmed
};

