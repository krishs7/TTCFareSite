// backend/src/fareEngine.js
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);

export const Agencies = {
  TTC: 'TTC',
  GO: 'GO',
  BRAMPTON: 'BRAMPTON',
  DRT: 'DRT',
  MIWAY: 'MIWAY',
  YRT: 'YRT'
};

export const Directions = {
  TTC_GO: 'TTC_GO',
  GO_TTC: 'GO_TTC',
  TTC_905: 'TTC_905'
};

export const PaymentMethods = {
  PRESTO_CARD: 'PRESTO_CARD',
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  PRESTO_GOOGLE_WALLET: 'PRESTO_GOOGLE_WALLET',
  PRESTO_TICKET: 'PRESTO_TICKET',
  E_TICKET: 'E_TICKET'
};

const participatingLocal = new Set([
  Agencies.TTC, Agencies.BRAMPTON, Agencies.DRT, Agencies.MIWAY, Agencies.YRT
]);

function isLocal(a) { return a !== Agencies.GO; }

export function computeWindowSeconds(startAgency) {
  // GO-started trips: 3h; local-started trips: 2h
  return startAgency === Agencies.GO ? 3 * 3600 : 2 * 3600;
}

export function allowedPayment(method) {
  // One Fare works for PRESTO card, PRESTO in Google Wallet, credit or debit on PRESTO devices.
  // PRESTO Tickets and e-tickets are NOT eligible.
  return method !== PaymentMethods.PRESTO_TICKET && method !== PaymentMethods.E_TICKET;
}

export function savingsText(direction, startAgency) {
  if (direction === Directions.TTC_GO || direction === Directions.GO_TTC) {
    return 'Your TTC leg is free when transferring with GO on the same card within the window.';
  }
  if (direction === Directions.TTC_905) {
    return 'Your second local transit leg is free within 2 hours on the same card.';
  }
  return startAgency === Agencies.GO
    ? 'Your local leg is discounted/free when transferring from GO within 3 hours.'
    : 'Your connecting leg is discounted/free within 2 hours on local transit.';
}

/**
 * @returns { eligibleNow, deadlineISO, windowSeconds, reasons[], savingsText, expiredNextSteps }
 */
export function checkEligibility({ direction, startAgency, firstTapISO, paymentMethod, sameCard }) {
  const reasons = [];

  if (!participatingLocal.has(startAgency) && startAgency !== Agencies.GO) {
    reasons.push('Starting agency is not in the participating list.');
  }
  if (!allowedPayment(paymentMethod)) {
    reasons.push('PRESTO Tickets/e-tickets are not eligible for One Fare.');
  }
  if (!sameCard) {
    reasons.push('You must use the same card/phone/watch for all taps.');
  }

  const windowSeconds = computeWindowSeconds(startAgency);
  const start = dayjs(firstTapISO);
  const deadline = start.add(windowSeconds, 'second');
  const now = dayjs();

  const withinTime = now.isBefore(deadline) || now.isSame(deadline);
  const eligibleNow = reasons.length === 0 && withinTime;

  let expiredNextSteps = null;
  if (!withinTime) {
    expiredNextSteps = (startAgency === Agencies.GO)
      ? 'Your next TTC/local tap will be charged normally. That tap starts a new 2-hour local window.'
      : 'Your next GO tap will be charged normally and starts a new 3-hour GO window.';
  }

  return {
    eligibleNow,
    deadlineISO: deadline.toISOString(),
    windowSeconds,
    reasons,
    savingsText: savingsText(direction, startAgency),
    expiredNextSteps
  };
}

