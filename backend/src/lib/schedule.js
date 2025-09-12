// backend/src/lib/schedule.js
// Chooses DB-backed schedule when USE_DB_SCHEDULE=1, otherwise the zero-DB ZIP loader (dev).

import * as dbSched from './scheduleDb.js';
import {
  loadTtcGtfsFromUrl,
  ttcNextArrivalsFromSchedule,
  expandStopIdsStationAware,
  ttcLinesAtStopInWindow,
} from './gtfsZipSchedule.js';

const useDb = String(process.env.USE_DB_SCHEDULE || '') === '1';

let nextArrivalsFromSchedule;
let expandStopIdsIfStation;
let linesAtStopWindow;

if (useDb) {
  // CockroachDB-backed schedule + station helpers
  nextArrivalsFromSchedule = dbSched.nextArrivalsFromSchedule;
  expandStopIdsIfStation   = dbSched.expandStopIdsIfStation;
  linesAtStopWindow        = dbSched.linesAtStopWindow;
} else {
  // Zero-DB (GTFS zip) fallback for local/dev use
  let loadOncePromise = null;
  const DEFAULT_TTC_GTFS =
    process.env.TTC_GTFS_ZIP_URL ||
    'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/TTC%20Routes%20and%20Schedules%20Data.zip';

  async function ensureLoaded() {
    if (!loadOncePromise) loadOncePromise = loadTtcGtfsFromUrl(DEFAULT_TTC_GTFS);
    await loadOncePromise;
  }

  nextArrivalsFromSchedule = async (agencyKey, stopId, opts = {}) => {
    const ag = String(agencyKey || '').toLowerCase();
    if (ag !== 'ttc') return [];
    await ensureLoaded();
    return ttcNextArrivalsFromSchedule(stopId, opts);
  };

  expandStopIdsIfStation = async (agencyKey, stopId) => {
    const ag = String(agencyKey || '').toLowerCase();
    if (ag !== 'ttc') return [String(stopId)];
    await ensureLoaded();
    return expandStopIdsStationAware(stopId);
  };

  linesAtStopWindow = async (agencyKey, stopId, { windowMin = 60 } = {}) => {
    const ag = String(agencyKey || '').toLowerCase();
    if (ag !== 'ttc') return [];
    await ensureLoaded();
    return ttcLinesAtStopInWindow(stopId, { windowMin });
  };
}

export { nextArrivalsFromSchedule, expandStopIdsIfStation, linesAtStopWindow };

