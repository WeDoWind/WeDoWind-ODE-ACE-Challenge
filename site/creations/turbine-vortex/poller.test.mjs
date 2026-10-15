import assert from 'node:assert/strict';
import { createAcePoller } from './ace-live.mjs';
const original = { fetch: globalThis.fetch, performance: globalThis.performance, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
let now = 0, calls = 0, errors = 0, values = 0;
let response = { ok: true, json: async () => ({ value: 0 }) };
const timers = new Map();
let timerId = 0;
globalThis.performance = { now: () => now };
globalThis.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
globalThis.fetch = async () => { calls++; return response; };
const settle = () => new Promise(setImmediate);
try {
  const poller = createAcePoller({ endpoint: 'https://example.invalid', onData: () => values++, onError: () => errors++ });
  poller.start();
  await settle();
  assert.equal(calls, 1);
  assert.equal(values, 1);
  assert.equal(await poller.refresh(), false);
  assert.equal(calls, 1);
  // Reproduce a browser timeout firing just before its monotonic deadline.
  now = 999.75;
  const early = [...timers.entries()].find(([, timer]) => timer.delay === 1000);
  timers.delete(early[0]); await early[1].callback();
  assert.equal(calls, 1, 'Early timer must not fetch before the cooldown');
  assert.ok([...timers.values()].some(timer => timer.delay === 1), 'Early timer must rearm itself');
  now = 1000;
  await poller.refresh();
  assert.equal(calls, 2);
  poller.stop();
  poller.start();
  assert.equal(calls, 2, 'Resume must respect cooldown');
  assert.ok([...timers.values()].some(timer => timer.delay === 1000));
  now = 2000;
  response = { ok: false, status: 429, headers: { get: () => '10' } };
  await poller.refresh();
  assert.equal(errors, 1);
  now = 3000;
  assert.equal(await poller.refresh(), false, 'Manual refresh must respect Retry-After');
  assert.ok([...timers.values()].some(timer => timer.delay === 9000));
  now = 12000;
  response = { ok: false, status: 429, headers: { get: () => null } };
  await poller.refresh();
  assert.equal(errors, 2);
  assert.ok([...timers.values()].some(timer => timer.delay === 60000));
  now = 13000;
  assert.equal(await poller.refresh(), false, 'Missing Retry-After must use conservative cooldown');
  now = 72000;
  let release;
  globalThis.fetch = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const pending = poller.refresh();
  now = 74000;
  assert.equal(await poller.refresh(), false, 'No overlapping request');
  release({ ok: true, json: async () => ({ value: 1 }) });
  await pending;
  assert.equal(values, 3);
  // Thousands of early timer deliveries must never strand the polling loop.
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ value: 1 }) }; };
  for (let i = 0; i < 10000; i++) {
    const [id, timer] = [...timers.entries()][0]; timers.delete(id);
    now += timer.delay - .25; await timer.callback();
    assert.ok(timers.size > 0, 'Automatic poll must remain scheduled');
    const [retryId, retry] = [...timers.entries()][0]; timers.delete(retryId);
    now += retry.delay; await retry.callback();
  }
  poller.stop();
  assert.equal(timers.size, 0);
  console.log('ACE polling starter passed: one-second limit, manual clicks, resume cooldown, Retry-After, overlap and stop.');
} finally {
  Object.assign(globalThis, original);
}

