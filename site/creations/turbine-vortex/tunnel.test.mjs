import test from 'node:test';
import assert from 'node:assert/strict';
import { TunnelMemory } from './tunnel.mjs';
const first = { rpm: 6, wind: .2, power: .1, brightness: .5, observed: 1000 };
test('history layers keep original conditions as new readings arrive', () => {
  const memory = new TunnelMemory(); memory.step(.1, first);
  const older = memory.layers[10], initialDepth = older.z;
  memory.step(1, { ...first, power: .9, wind: .8, observed: 2000 });
  assert.equal(older.power, .1); assert.equal(older.wind, .2); assert.equal(older.observed, 1000);
  assert.ok(older.z < initialDepth);
  assert.equal(memory.layers[0].power, .9);
  assert.equal(memory.layers[0].observed, 2000);
});
test('older layers leave the screen and memory stays bounded over a long session', () => {
  const memory = new TunnelMemory(); memory.step(.1, first);
  const oldLayer = memory.layers[10];
  for (let i = 0; i < 36000; i++) memory.step(.1, first);
  assert.ok(!memory.layers.includes(oldLayer)); assert.ok(memory.layers.length <= 110);
  assert.ok(memory.layers.every(layer => layer.z > .45 && layer.z <= 28));
});
test('zero RPM produces no rotation while camera travel remains artistic', () => {
  const memory = new TunnelMemory(); memory.step(1, { ...first, rpm: 0 });
  assert.equal(memory.rotation, 0);
});
