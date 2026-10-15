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
test('smooth tip trails remain finite and attach to the rotating blade tips', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  renderer.width = 1200; renderer.height = 600;
  renderer.memory.step(.1, first);
  for (let blade = 0; blade < 3; blade++) {
    const angle = blade * Math.PI * 2 / 3;
    const samples = renderer.wakeSamples(first, angle);
    assert.deepEqual(samples[0].point, renderer.point({ ...first, z: 28, twist: renderer.memory.rotation }, angle));
    assert.ok(samples.every(s => s.point.every(Number.isFinite)));
  }
});

test('calm and strong-wind sessions retain bounded history for an hour', () => {
  for (const wind of [0, 1]) {
    const memory = new TunnelMemory();
    for (let i = 0; i < 36000; i++) memory.step(.1, { ...first, wind });
    assert.ok(memory.layers.length <= 140);
    assert.ok(memory.layers.every(layer => layer.z > .45 && layer.z <= 28));
  }
});

test('wind roughness changes downstream polygons but never detaches blade tips', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  renderer.width = 1200; renderer.height = 600;
  const calm = { ...first, z: 10, twist: .7, turbulence: 0 };
  const rough = { ...calm, turbulence: 1 };
  assert.notDeepEqual(renderer.point(calm, .3), renderer.point(rough, .3));
  assert.deepEqual(renderer.point(rough, .3), renderer.point(rough, .3));
  for (let blade = 0; blade < 3; blade++) {
    const a = blade * Math.PI * 2 / 3;
    assert.deepEqual(renderer.point({ ...calm, z: 28 }, a), renderer.point({ ...rough, z: 28 }, a));
  }
  const points = [[0,0],[2,3],[5,2],[8,5]], controls = curveControls(points, 1, 1);
  assert.deepEqual(controls, [3, 3 - 1/3, 4, 3 - 2/3, 5, 2]);
});

test('no-data view ignores retained twist and draws only a centred straight tunnel', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]), set: () => true });
  const renderer = new TunnelRenderer({ getContext: () => ctx });
  renderer.width = 1200; renderer.height = 600;
  renderer.memory.step(1, first);
  const before = JSON.stringify(renderer.memory.layers);
  renderer.render(.1, first, { active: false, resting: true, force: true });
  assert.equal(JSON.stringify(renderer.memory.layers), before);
  const arcs = calls.filter(call => call[0] === 'arc');
  assert.equal(arcs.length, 23);
  assert.ok(arcs.every(call => call[1] === 600 && call[2] === 300));
  assert.equal(calls.filter(call => call[0] === 'lineTo').length, 24);
  assert.ok(!calls.some(call => ['bezierCurveTo', 'quadraticCurveTo', 'rotate', 'createRadialGradient'].includes(call[0])));
});

test('rotor is composited separately from persistent wake without a dark mask', () => {
  const wakeCalls = [], displayCalls = [];
  const context = calls => new Proxy({}, {
    get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...args) => calls.push([key, ...args]),
    set: () => true
  });
  const wake = { getContext: () => context(wakeCalls) };
  const canvas = { getContext: () => context(displayCalls), ownerDocument: { createElement: () => wake } };
  const renderer = new TunnelRenderer(canvas);
  renderer.resize(800, 600, 2);
  renderer.render(.1, first, { active: true, resting: false });
  assert.equal(wake.width, 1600); assert.equal(wake.height, 1200);
  assert.ok(displayCalls.some(call => call[0] === 'drawImage'));
  assert.equal(displayCalls.filter(call => call[0] === 'quadraticCurveTo').length, 6);
  assert.ok(!wakeCalls.some(call => call[0] === 'quadraticCurveTo'));
  assert.ok(!displayCalls.some(call => call[0] === 'fillRect'));
});
