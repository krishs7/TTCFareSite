// backend/src/lib/adapters/index.js
import { ttc } from './ttc.js';
import { miway } from './miway.js';
import { brampton } from './brampton.js';
import { drt } from './drt.js';
import { yrt } from './yrt.js';

export const adapters = {
  ttc,
  miway,
  brampton,
  drt,
  yrt,
};

// Normalize user/system agency names to these keys
export function normalizeAgency(s = '') {
  const x = s.trim().toLowerCase();
  if (['ttc', 'toronto'].includes(x)) return 'ttc';
  if (['miway', 'mississauga'].includes(x)) return 'miway';
  if (['brampton'].includes(x)) return 'brampton';
  if (['drt', 'durham'].includes(x)) return 'drt';
  if (['yrt', 'york'].includes(x)) return 'yrt';
  return null;
}

