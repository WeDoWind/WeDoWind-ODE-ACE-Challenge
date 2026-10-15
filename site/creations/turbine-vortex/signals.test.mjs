import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, parseSignals, AdaptiveRange, STALE_MS, visualTargets, powerHue, angleDifference, SignalFreshness, PowerAverage, WindChanges } from './signals.mjs';
const now = 1791927600000;
const fixture = () => ({ series: Object.fromEntries(FIELDS.map(f => [f, [0]])), series_quality: Object.fromEntries(FIELDS.map(f => [f, ['Good']])), series_observed_at: Object.fromEntries(FIELDS.map(f => [f, [now * 1000]])) });
test('preserves zero, signed power and per-field observation times', () => {
  const data = fixture(); data.series.wec_active_power = [-2];
  data.series_quality.wec_wind_speed = ['good'];
  data.series_observed_at.wec_wind_speed = [(now - 61000) * 1000];
  const result = parseSignals(data, now);
  assert.equal(result.rpm.value, 0); assert.equal(result.power.value, -2);
  assert.equal(result.oldest, now - 61000); assert.ok(now - result.oldest > STALE_MS);
});
test('rejects missing/null readings, bad quality and invalid times', () => {
  for (const field of FIELDS) {
    for (const bad of [null, undefined, NaN, '1']) { const d = fixture(); d.series[field] = [bad]; assert.throws(() => parseSignals(d, now)); }
    const bad = fixture(); bad.series_quality[field] = ['Bad']; assert.throws(() => parseSignals(bad, now));
    for (const timestamp of [null, 0, Infinity]) { const d = fixture(); d.series_observed_at[field] = [timestamp]; assert.throws(() => parseSignals(d)); }
  }
});
test('data parsing does not depend on the local wall clock', () => {
  const d = fixture();
  for (const field of FIELDS) d.series_observed_at[field] = [(now + 5600) * 1000];
  assert.equal(parseSignals(d, now).oldest, now + 5600);
  d.series_observed_at.wec_wind_speed = [(now + 60000) * 1000];
  assert.equal(parseSignals(d, now).wind.observed, now + 60000);
  assert.equal(parseSignals(d, 0).wind.observed, now + 60000);
  d.series.wec_active_power = [null];
  assert.throws(() => parseSignals(d, now), /Missing or invalid wec_active_power reading/);
});
test('freshness detects stalled signals and data-relative age independently of wall time', () => {
  const clock = new SignalFreshness(), reading = parseSignals(fixture());
  clock.update(reading, 0); assert.equal(clock.stale(59999), false);
  clock.update(reading, 50000); assert.equal(clock.stale(60001), true, 'Repeated same data cannot reset freshness');
  const newer = fixture(); for (const field of FIELDS) newer.series_observed_at[field] = [(now + 100000) * 1000];
  clock.update(parseSignals(newer), 61000); assert.equal(clock.stale(61000), false);
  const old = fixture(); old.collection_timestamps = [(now + 70000) * 1000];
  const aged = new SignalFreshness(); aged.update(parseSignals(old), 0); assert.equal(aged.stale(0), true);
});
test('30-second mean is time weighted, ignores duplicates and excludes expired history', () => {
  const average = new PowerAverage(); average.add(100, now); average.add(200, now + 10000); average.add(300, now + 30000);
  assert.ok(Math.abs(average.mean() - 500 / 3) < .0001);
  average.add(999, now + 30000); assert.ok(Math.abs(average.mean() - 500 / 3) < .0001);
  average.add(300, now + 40000); assert.ok(Math.abs(average.mean() - 700 / 3) < .0001);
  for (let i = 40001; i < 50000; i++) average.add(300, now + i);
  assert.ok(average.samples.length <= 256);
  const read = parseSignals(fixture()); read.power.value = 120;
  assert.ok(visualTargets(read, .5, .5, 100).brightness > .5);
  read.power.value = 80; assert.ok(visualTargets(read, .5, .5, 100).brightness < .5);
  read.power.value = 100; assert.equal(visualTargets(read, .5, .5, 100).brightness, .5);
});
test('steady signals resist noise and duplicate observations', () => {
  const range = new AdaptiveRange(250); range.add(200, now, now);
  for (let i = 1; i < 100; i++) range.add(200, now, now + i * 2000);
  assert.equal(range.samples.length, 1); assert.equal(range.normalize(200), .5);
  assert.ok(Math.abs(range.normalize(201) - .5) < .01);
});
test('clustered changes are visible and adaptation is gradual and bounded', () => {
  const range = new AdaptiveRange(1.5); range.add(5, now, now);
  assert.ok(range.normalize(5.5) > .8);
  range.add(10, now + 2000, now + 2000);
  assert.ok(range.center < 6); assert.ok(range.span >= 1.5);
  assert.equal(range.normalize(100), 1); assert.equal(range.normalize(-100), 0);
  range.add(8, now + 302000, now + 302000);
  assert.equal(range.samples.length, 2);
});
test('signed vane angles are valid and easing takes the short route across wraparound', () => {
  const data = fixture(); data.series.wec_wind_direction = [-12];
  assert.equal(parseSignals(data, now).direction.value, -12);
  assert.equal(angleDifference(1, 359), 2);
  assert.equal(angleDifference(359, 1), -2);
});
test('absolute meanings stay fixed while recent detail changes', () => {
  const data = fixture(); data.series.wec_wind_speed = [5]; data.series.wec_active_power = [1000];
  const reading = parseSignals(data, now);
  const calm = visualTargets(reading, 0, 0), lively = visualTargets(reading, 1, 1);
  assert.equal(calm.wind, lively.wind); assert.equal(calm.power, lively.power);
  assert.equal(calm.brightness, lively.brightness);
  assert.ok(powerHue(0) > powerHue(250)); assert.ok(powerHue(1000) > powerHue(4200));
  assert.equal(visualTargets(parseSignals(fixture(), now)).power, 0);
});
test('wind-change effects use observation intervals and ignore duplicate readings', () => {
  const change = new WindChanges();
  change.add({ value: 5, observed: now }); assert.equal(change.rate, 0);
  change.add({ value: 6, observed: now + 2000 }); assert.equal(change.rate, .5);
  change.add({ value: 12, observed: now + 2000 }); assert.equal(change.rate, .5);
  change.add({ value: 6, observed: now + 4000 }); assert.equal(change.rate, 0);
  change.add({ value: 10, observed: now + 70000 }); assert.equal(change.rate, 0);
  const reading = parseSignals(fixture()); reading.power.value = 150;
  assert.equal(visualTargets(reading, .5, .5, 100, .5).turbulence, 1);
  assert.equal(visualTargets(reading, .5, .5, 100, 0).shedding, 1);
  reading.power.value = 100;
  assert.equal(visualTargets(reading, .5, .5, 100, 0).shedding, 0);
});
