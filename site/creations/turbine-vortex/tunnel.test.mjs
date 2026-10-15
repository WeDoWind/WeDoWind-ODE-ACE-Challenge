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
  assert.equal(older.direction, 0); assert.equal(memory.layers[0].direction, 30);
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
  assert.ok(memory.layers.every(layer => layer.z > .45 && layer.z <= 18));
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
    assert.deepEqual(samples[0].point, renderer.point({ ...first, z: 18, twist: renderer.memory.rotation }, angle));
    assert.ok(samples.every(s => s.point.every(Number.isFinite)));
  }
});

test('calm and strong-wind sessions retain bounded history for an hour', () => {
  for (const wind of [0, 1]) {
    const memory = new TunnelMemory();
    for (let i = 0; i < 36000; i++) memory.step(.1, { ...first, wind });
    assert.ok(memory.layers.length <= 140);
    assert.ok(memory.layers.every(layer => layer.z > .45 && layer.z <= 18));
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
    assert.deepEqual(renderer.point({ ...calm, z: 18 }, a), renderer.point({ ...rough, z: 18 }, a));
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

test('wake is displayed without a rotor graphic or dark mask', () => {
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
  assert.equal(displayCalls.filter(call => call[0] === 'quadraticCurveTo').length, 0);
  assert.ok(!wakeCalls.some(call => call[0] === 'quadraticCurveTo'));
  assert.ok(!displayCalls.some(call => call[0] === 'fillRect'));
});

test('rotor stays centred for every direction and neutral wind gives a straight centreline', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  for (const [width, height] of [[1200,600], [600,1200]]) {
    renderer.width = width; renderer.height = height;
    for (const direction of [-180,-45,0,45,180]) {
      const source = renderer.circle({ z: 18, direction });
      assert.equal(source.cx, width / 2); assert.equal(source.cy, height / 2);
    }
    for (const z of [.45,4,9,14,18]) {
      const centre = renderer.circle({ z, direction: 0 });
      assert.equal(centre.cx, width / 2); assert.equal(centre.cy, height / 2);
    }
    const left = renderer.circle({ z: 14, direction: -30 });
    const right = renderer.circle({ z: 14, direction: 30 });
    assert.ok(left.cx < width / 2 && right.cx > width / 2);
    assert.equal(left.cy, right.cy);
  }
});

test('startup lines are straight and live layers progressively introduce the vortex', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  renderer.width = 1200; renderer.height = 600;
  const signal = { ...first, direction: 30, turbulence: 1 };
  renderer.memory.step(0, signal);
  for (const layer of renderer.memory.layers) {
    assert.equal(layer.depthTwist, 0);
    assert.equal(layer.direction, 0); assert.equal(layer.turbulence, 0);
    const point = renderer.point(layer, Math.PI / 3);
    assert.ok(Math.abs(Math.atan2(point[1] - 300, point[0] - 600) - Math.PI / 3) < 1e-10);
  }
  renderer.memory.step(.7, signal);
  assert.equal(renderer.memory.layers[0].depthTwist, 1);
  assert.equal(renderer.memory.layers[0].direction, 30);
  assert.equal(renderer.memory.layers[0].turbulence, 1);
  assert.ok(renderer.memory.layers.some(layer => layer.depthTwist === 0));
});

test('expanded perspective preserves rotor size and spreads distant turns by 4', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  renderer.width = 1200; renderer.height = 600;
  const unit = 600 * 1.25;
  assert.equal(renderer.circle({ z: 18 }).radius, unit / 28.2);
  const far = renderer.circle({ z: 17 }).radius, nearer = renderer.circle({ z: 15 }).radius;
  const originalSpacing = unit * (1 / (15 * 28 / 18 + .2) - 1 / (17 * 28 / 18 + .2));
  assert.ok(Math.abs((nearer - far) / originalSpacing - 4) < 1e-10);
  const radii = [18,15,12,8,2].map(z => renderer.circle({ z }).radius);
  assert.ok(radii.every((radius, i) => i === 0 || radius > radii[i - 1]));
});

test('walls and three blade trails share the complete measured rotor phase', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  renderer.width = 1200; renderer.height = 600;
  const layer = { ...first, z: 14, twist: 1, depthTwist: 0, direction: 0, turbulence: 0 };
  const wall = renderer.wallPoint(layer, 0), trail = renderer.wakePoint(layer, 0);
  assert.ok(Math.abs(Math.atan2(wall[1] - 300, wall[0] - 600) - 1) < 1e-10);
  assert.ok(Math.abs(Math.atan2(trail[1] - 300, trail[0] - 600) - 1) < 1e-10);
  assert.deepEqual(renderer.wallPoint({ ...layer, twist: 0 }, 0), renderer.wakePoint({ ...layer, twist: 0 }, 0));
});

test('three blade trails keep 120-degree spacing and no depth-dependent extra rotation', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  renderer.width = 1200; renderer.height = 600;
  renderer.memory.step(0, { ...first, rpm: 12 });
  renderer.memory.step(1, { ...first, rpm: 12 });
  assert.ok(Math.abs(renderer.memory.rotation - Math.PI * 2 / 5) < 1e-10);
  for (const z of [18,14,10,2]) {
    const layer = { ...first, direction: 0, turbulence: 0, z, twist: renderer.memory.rotation };
    for (let blade = 0; blade < 3; blade++) {
      const angle = layer.twist + blade * Math.PI * 2 / 3;
      const [x,y] = renderer.wakePoint(layer, blade * Math.PI * 2 / 3);
      const radius = renderer.circle(layer).radius;
      assert.ok(Math.abs((x-600)/radius - Math.cos(angle)) < 1e-10);
      assert.ok(Math.abs((y-300)/radius - Math.sin(angle)) < 1e-10);
      assert.deepEqual(renderer.wallPoint(layer, blade * Math.PI * 2 / 3), [x,y]);
    }
  }
});

test('global artistic roll is slow, shared and independent of stored RPM phase', () => {
  const renderer = new TunnelRenderer({ getContext: () => ({}) });
  renderer.width = 1200; renderer.height = 600;
  const layer = { ...first, z: 9, twist: .5, direction: 0, turbulence: 0 };
  const before = renderer.wakePoint(layer, 0);
  renderer.time = 10;
  const after = renderer.wakePoint(layer, 0);
  assert.ok(Math.abs(Math.atan2(after[1]-300,after[0]-600) - Math.atan2(before[1]-300,before[0]-600) - .25) < 1e-10);
  assert.equal(layer.twist, .5);
  const memory = new TunnelMemory(); memory.step(0, first);
  assert.ok(memory.layers.length < 30);
});
