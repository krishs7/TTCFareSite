// backend/tests/stopsRoute.test.js
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';

describe('GET /api/stops', () => {
  let agent;
  const hasDB = !!process.env.DATABASE_URL;

  before(() => { agent = request(app); });

  test('responds based on DB availability', async () => {
    const res = await agent.get('/api/stops?query=union');

    if (hasDB) {
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      // If you imported TTC/GO, "Union" should exist (not guaranteed by feed, so be lenient)
      assert.ok('items' in res.body);
    } else {
      assert.equal(res.status, 501);
      assert.ok(res.body.error);
    }
  });
});

