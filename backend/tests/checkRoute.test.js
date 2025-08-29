// backend/tests/checkRoute.test.js
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';

describe('POST /api/check', () => {
  let agent;
  before(() => { agent = request(app); });

  test('valid payload returns 200 + eligibility fields', async () => {
    const nowISO = new Date().toISOString();
    const res = await agent.post('/api/check')
      .set('content-type', 'application/json')
      .send({
        direction: 'TTC_GO',
        startAgency: 'TTC',
        firstTapISO: nowISO,
        paymentMethod: 'PRESTO_CARD',
        sameCard: true
      });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.eligibleNow, 'boolean');
    assert.ok(res.body.deadlineISO);
    assert.equal(typeof res.body.savingsText, 'string');
  });

  test('invalid payload returns 400', async () => {
    const res = await agent.post('/api/check')
      .set('content-type', 'application/json')
      .send({ foo: 'bar' });

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

