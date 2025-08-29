// backend/tests/fareEngine.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkEligibility, Agencies, Directions, PaymentMethods } from '../src/fareEngine.js';

function isoMinus(sec) { return new Date(Date.now() - sec*1000).toISOString(); }

describe('fareEngine.checkEligibility', () => {
  test('TTC → GO within 2h is eligible', () => {
    const r = checkEligibility({
      direction: Directions.TTC_GO,
      startAgency: Agencies.TTC,
      firstTapISO: isoMinus(60), // 1 min ago
      paymentMethod: PaymentMethods.PRESTO_CARD,
      sameCard: true
    });
    assert.equal(r.eligibleNow, true);
    assert.ok(r.deadlineISO);
    assert.equal(r.reasons.length, 0);
  });

  test('TTC → GO after 2h is not eligible and suggests GO next steps', () => {
    const r = checkEligibility({
      direction: Directions.TTC_GO,
      startAgency: Agencies.TTC,
      firstTapISO: isoMinus(2*3600 + 5), // 2h + 5s ago
      paymentMethod: PaymentMethods.PRESTO_CARD,
      sameCard: true
    });
    assert.equal(r.eligibleNow, false);
    assert.ok(r.expiredNextSteps.includes('GO'));
  });

  test('GO → TTC within 3h is eligible', () => {
    const r = checkEligibility({
      direction: Directions.GO_TTC,
      startAgency: Agencies.GO,
      firstTapISO: isoMinus(60), // 1 min ago
      paymentMethod: PaymentMethods.CREDIT,
      sameCard: true
    });
    assert.equal(r.eligibleNow, true);
  });

  test('Different card/phone/watch is not eligible', () => {
    const r = checkEligibility({
      direction: Directions.GO_TTC,
      startAgency: Agencies.GO,
      firstTapISO: isoMinus(60),
      paymentMethod: PaymentMethods.DEBIT,
      sameCard: false
    });
    assert.equal(r.eligibleNow, false);
    assert.ok(r.reasons.some(x => x.toLowerCase().includes('same card')));
  });

  test('PRESTO Ticket / e-ticket not eligible', () => {
    const r1 = checkEligibility({
      direction: Directions.TTC_905,
      startAgency: Agencies.TTC,
      firstTapISO: isoMinus(60),
      paymentMethod: PaymentMethods.PRESTO_TICKET,
      sameCard: true
    });
    assert.equal(r1.eligibleNow, false);
    assert.ok(r1.reasons.some(x => x.toLowerCase().includes('ticket')));

    const r2 = checkEligibility({
      direction: Directions.TTC_905,
      startAgency: Agencies.TTC,
      firstTapISO: isoMinus(60),
      paymentMethod: PaymentMethods.E_TICKET,
      sameCard: true
    });
    assert.equal(r2.eligibleNow, false);
  });

  test('TTC ⇄ 905 within 2h is eligible', () => {
    const r = checkEligibility({
      direction: Directions.TTC_905,
      startAgency: Agencies.TTC,
      firstTapISO: isoMinus(90), // 1.5h ago
      paymentMethod: PaymentMethods.PRESTO_CARD,
      sameCard: true
    });
    assert.equal(r.eligibleNow, true);
  });
});

