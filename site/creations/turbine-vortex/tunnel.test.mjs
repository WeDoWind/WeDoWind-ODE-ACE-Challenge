import test from 'node:test';
import assert from 'node:assert/strict';
import { TunnelMemory, TunnelRenderer, curveControls } from './tunnel.mjs';
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
test('bend scale is independent of aspect ratio', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  const layer = { ...first, z: 14, twist: 0, direction: 45 };
  renderer.width = 1200; renderer.height = 600;
  const a = renderer.circle(layer);
  renderer.width = 600; renderer.height = 1200;
  const b = renderer.circle(layer);
  assert.equal(a.radius, b.radius);
  assert.ok(Math.abs((a.cx - 600) - (b.cx - 300)) < 1e-10);
  assert.ok(Math.abs((a.cy - 300) - (b.cy - 600)) < 1e-10);
});
test('curve segments have continuous tangents', () => {
  const points = [[0,0],[2,3],[5,2],[8,5]];
  const a = curveControls(points, 0), b = curveControls(points, 1);
  assert.deepEqual(a.slice(4), points[1]);
  assert.ok(Math.abs((points[1][0] - a[2]) - (b[0] - points[1][0])) < 1e-10);
  assert.ok(Math.abs((points[1][1] - a[3]) - (b[1] - points[1][1])) < 1e-10);
});
test('wake deformation grows downstream without detaching blade tips', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  renderer.width = 1200; renderer.height = 600;
  const calm = { ...first, z: 28, twist: 0, shedding: 0, turbulence: 0 };
  const active = { ...calm, shedding: 1, turbulence: 1, curlSign: 1 };
  assert.deepEqual(renderer.wakePoint(calm, 0), renderer.wakePoint(active, 0));
  const down = { ...active, z: 10 };
  assert.notDeepEqual(renderer.wakePoint(down, 0), renderer.wakePoint({ ...down, shedding: 0 }, 0));
  assert.notDeepEqual(renderer.point(down, .2), renderer.point({ ...down, turbulence: 0 }, .2));
  renderer.memory.layers = [down];
  const samples = renderer.wakeSamples(active, 0);
  assert.ok(samples.length > 3 && samples.length <= 17);
  assert.ok(samples.every(s => s.point.every(Number.isFinite)));
});
test('calm and strong-wind sessions retain bounded history for an hour', () => {
  for (const wind of [0, 1]) {
    const memory = new TunnelMemory();
    for (let i = 0; i < 36000; i++) memory.step(.1, { ...first, wind });
    assert.ok(memory.layers.length <= 140);
    assert.ok(memory.layers.every(layer => layer.z > .45 && layer.z <= 28));
  }
});
