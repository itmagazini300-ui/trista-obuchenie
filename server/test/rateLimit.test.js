import './env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../src/rateLimit.js';

process.env.RATE_LIMIT_IN_TESTS = '1';

function run(mw, ip) {
  let status = 200;
  let passed = false;
  const res = { set() {}, status(s) { status = s; return { json() {} }; } };
  mw({ ip }, res, () => { passed = true; });
  return passed ? 200 : status;
}

test('след границата връща 429, другите адреси не се засягат', () => {
  const mw = rateLimit({ windowMs: 60000, max: 3 });
  assert.deepEqual([1, 2, 3, 4].map(() => run(mw, '1.1.1.1')), [200, 200, 200, 429]);
  assert.equal(run(mw, '2.2.2.2'), 200);
});

test('след изтичане на прозореца броячът се нулира', async () => {
  const mw = rateLimit({ windowMs: 30, max: 1 });
  assert.equal(run(mw, '3.3.3.3'), 200);
  assert.equal(run(mw, '3.3.3.3'), 429);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(run(mw, '3.3.3.3'), 200);
});
