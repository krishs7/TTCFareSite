// backend/src/lib/schedule.js (hybrid)
import {
  loadTtcGtfsFromUrl,
  ttcNextArrivalsFromSchedule,
  expandStopIdsStationAware as zipExpand,
  ttcLinesAtStopInWindow
} from './gtfsZipSchedule.js';

import {
  nextArrivalsFromSchedule as dbNext,
  expandStopIdsIfStation as dbExpand,
  linesAtStopWindow as dbLines
} from './scheduleDb.js';

const USE_DB = String(process.env.USE_DB_SCHEDULE || '1') === '1';

let loadOncePromise = null;
const DEFAULT_TTC_GTFS =
  process.env.TTC_GTFS_ZIP_URL ||
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/TTC Routes and Schedules Data.zip';

async function ensureLoadedZip() {
  if (loadOncePromise) return loadOncePromise;
  loadOncePromise = (async () => {
    try {
      await loadTtcGtfsFromUrl(DEFAULT_TTC_GTFS);
      console.log('[GTFS] TTC zip loaded (zero-DB mode)');
    } catch (e) {
      console.error('[GTFS] TTC zip load failed:', e?.message || e);
    }
  })();
  return loadOncePromise;
}

export async function nextArrivalsFromSchedule(agencyKey, stopId, opts = {}) {
  if (USE_DB) return dbNext(agencyKey, stopId, opts);
  await ensureLoadedZip();
  return ttcNextArrivalsFromSchedule(stopId, opts);
}

export async function expandStopIdsIfStation(agencyKey, stopId) {
  if (USE_DB) return dbExpand(agencyKey, stopId);
  await ensureLoadedZip();
  return zipExpand(stopId);
}

export async function linesAtStopWindow(agencyKey, stopId, opts = {}) {
  if (USE_DB) return dbLines(agencyKey, stopId, opts);
  await ensureLoadedZip();
  return ttcLinesAtStopInWindow(stopId, opts);
}

