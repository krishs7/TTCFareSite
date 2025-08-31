import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Reminders + Jobs', () => {
  let agent; const hasDB = !!process.env.DATABASE_URL;
  before(() => { agent = request(app); });

  test('POST /api/reminders requires DB + fields', async () => {
    if (!hasDB) {
      const res = await agent.post('/api/reminders')
        .set('content-type','application/json')
        .send({ subscriptionId: 'X', deadlineISO: new Date().toISOString() });
      assert.equal(res.status, 501);
      return;
    }

    // 1) create a real subscription
    const sub = {
      endpoint: 'https://example.com/endpoint/xyz',
      keys: { p256dh: 'p', auth: 'a' }
    };
    const subRes = await agent.post('/api/push/subscribe')
      .set('content-type','application/json')
      .send({ subscription: sub, userAgent: 'test-agent' });
    assert.equal(subRes.status, 200);
    const subId = subRes.body.id;

    // 2) schedule reminders with that id
    const deadlineISO = new Date(Date.now() + 60_000).toISOString();
    const remRes = await agent.post('/api/reminders')
      .set('content-type','application/json')
      .send({ subscriptionId: subId, deadlineISO });
    assert.equal(remRes.status, 200);
    assert.ok(remRes.body.ok);
  });

  test('POST /api/jobs/run executes (may send 0 in dev)', async () => {
    const res = await agent.post('/api/jobs/run');
    assert.equal(res.status, hasDB ? 200 : 501);
  });
});

