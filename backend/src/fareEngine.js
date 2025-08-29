import dayjs from 'dayjs';
import utc from 'dayjs-plugin-utc';
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
  TTC_GO: 'TTC_GO',   // TTC → GO (or GO → TTC if you flip start agency)
  GO_TTC: 'GO_TTC',
  TTC_905: 'TTC_905'  // TTC ↔ 905 local-local
};

export const PaymentMethods = {
  PRESTO_CARD: 'PRESTO_CARD',
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  PRESTO_GOOGLE_WALLET: 'PRESTO_GOOGLE_WALLET',
  PRESTO_TICKET: 'PRESTO_TICKET',
  E_TICKET: 'E_TICKET'
};

const isLocalAgency = (a) => a !== Agencies.GO;
const participatingLocal = new Set([
  Agencies.TTC, Agencies.BRAMPTON, Agencies.DRT, Agencies.MIWAY, Agencies.YRT
]);

export function computeWindowSeconds(startAgency) {
  return startAgency === Agencies.GO ? 3 * 3600 : 2 * 3600;
}

export function allowedPayment(paymentMethod) {
  // Tickets (paper/e-tickets) are not eligible
  return paymentMethod !== PaymentMethods.PRESTO_TICKET && paymentMethod !== PaymentMethods.E_TICKET;
}

export function savingsText(direction, startAgency) {
  if (direction === Directions.TTC_GO || direction === Directions.GO_TTC) {
    return 'Your TTC leg is free when transferring with GO on the same card within the window.';
  }
  if (direction === Directions.TTC_905) {
    return 'Your second local transit leg is free within 2 hours on the same card.';
  }
  // Fallback for unexpected combos
  return startAgency === Agencies.GO
    ? 'Your local leg is discounted/free when transferring from GO within 3 hours.'
    : 'Your connecting leg is discounted/free within 2 hours on local transit.';
}

/**
 * Main eligibility function.
 * @returns { eligibleNow, deadlineISO, windowSeconds, reasons[], savingsText, expiredNextSteps }
 */
export function checkEligibility({
  direction,
  startAgency,
  firstTapISO,
  paymentMethod,
  sameCard
}) {
  const reasons = [];

  // Basic validation of agencies
  if (!participatingLocal.has(startAgency) && startAgency !== Agencies.GO) {
    reasons.push('Starting agency is not in the participating list.');
  }

  // Payment method rules
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

  // “What happens if expired?”
  let expiredNextSteps = null;
  if (!withinTime) {
    if (startAgency === Agencies.GO) {
      expiredNextSteps = 'Your next TTC/local tap will be charged normally. That tap starts a new 2-hour local window.';
    } else {
      expiredNextSteps = 'Your next GO tap will be charged normally and starts a new 3-hour GO window.';
    }
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

