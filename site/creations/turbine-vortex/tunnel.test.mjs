import test from 'node:test';
import assert from 'node:assert/strict';
import { TunnelMemory, TunnelRenderer } from './tunnel.mjs';
const first = { rpm: 6, wind: .2, power: .1, brightness: .5, observed: 1000, direction: -12 };
test('history layers keep original conditions as new readings arrive', () => {
  const memory = new TunnelMemory(); memory.step(.1, first);
  const older = memory.layers[10], initialDepth = older.z;
  memory.step(1, { ...first, power: .9, wind: .8, observed: 2000, direction: 30 });
  assert.equal(older.power, .1); assert.equal(older.wind, .2); assert.equal(older.observed, 1000);
  assert.ok(older.z < initialDepth);
  assert.equal(memory.layers[0].power, .9);
  assert.equal(memory.layers[0].observed, 2000);
  assert.equal(older.direction, -12); assert.equal(memory.layers[0].direction, 30);
});
test('cross-sections are circular and fully offscreen layers are discarded', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  renderer.width = 1200; renderer.height = 600;
  const layer = { ...first, z: 10, twist: .5 };
  const center = renderer.circle(layer);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const point = renderer.point(layer, angle);
    assert.ok(Math.abs(Math.hypot(point[0] - center.cx, point[1] - center.cy) - center.radius) < .00001);
  }
  const offscreen = { ...first, z: .1, twist: .5 };
  renderer.memory.layers = [layer, offscreen]; renderer.discardOffscreen();
  assert.deepEqual(renderer.memory.layers, [layer]);
  assert.deepEqual(renderer.memory.timeRange(), { oldest: 1000, newest: 1000 });
});
test('older layers leave the screen and memory stays bounded over a long session', () => {
  const memory = new TunnelMemory(); memory.step(.1, first);
  const oldLayer = memory.layers[10];
  for (let i = 0; i < 36000; i++) memory.step(.1, first);
  assert.ok(!memory.layers.includes(oldLayer)); assert.ok(memory.layers.length <= 140);
  assert.ok(memory.layers.every(layer => layer.z > .45 && layer.z <= 28));
});
test('zero RPM produces no rotation while camera travel remains artistic', () => {
  const memory = new TunnelMemory(); memory.step(1, { ...first, rpm: 0 });
  assert.equal(memory.rotation, 0);
});
test('1.0 multiplier gives one revolution in five seconds at a steady 12 RPM', () => {
  const memory = new TunnelMemory();
  for (let i = 0; i < 150; i++) memory.step(1 / 30, { ...first, rpm: 12 });
  assert.ok(Math.abs(memory.rotation - 2 * Math.PI) < 1e-10);
});
test('calm and strong-wind sessions retain bounded history for an hour', () => {
  for (const wind of [0, 1]) {
    const memory = new TunnelMemory();
    for (let i = 0; i < 36000; i++) memory.step(.1, { ...first, wind });
    assert.ok(memory.layers.length <= 140);
    assert.ok(memory.layers.every(layer => layer.z > .45 && layer.z <= 28));
  }
});
