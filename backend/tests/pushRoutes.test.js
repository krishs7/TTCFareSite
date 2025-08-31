import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Push subscribe route', () => {
  let agent; const hasDB = !!process.env.DATABASE_URL;
  before(() => { agent = request(app); });

  test('POST /api/push/subscribe validates body or stores sub', async () => {
    // bad body -> 400 (or 501 if no DB)
    const resBad = await agent.post('/api/push/subscribe')
      .set('content-type','application/json')
      .send({ foo: 'bar' });
    assert.equal(resBad.status, hasDB ? 400 : 501);

    if (hasDB) {
      const sub = {
        endpoint: 'https://example.com/endpoint/123',
        keys: { p256dh: 'p', auth: 'a' }
      };
      const resOk = await agent.post('/api/push/subscribe')
        .set('content-type','application/json')
        .send({ subscription: sub, userAgent: 'test-agent' });
      assert.equal(resOk.status, 200);
      assert.ok(resOk.body.id);
    }
  });
});

