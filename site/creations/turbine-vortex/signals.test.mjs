import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, parseSignals, AdaptiveRange, STALE_MS, visualTargets, powerHue, angleDifference } from './signals.mjs';
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
test('rejects missing/null readings, bad quality and invalid/future times', () => {
  for (const field of FIELDS) {
    for (const bad of [null, undefined, NaN, '1']) { const d = fixture(); d.series[field] = [bad]; assert.throws(() => parseSignals(d, now)); }
    const bad = fixture(); bad.series_quality[field] = ['Bad']; assert.throws(() => parseSignals(bad, now));
    for (const timestamp of [null, 0, Infinity, (now + 60001) * 1000]) { const d = fixture(); d.series_observed_at[field] = [timestamp]; assert.throws(() => parseSignals(d, now)); }
  }
});
test('accepts observed API clock skew while rejecting implausible future timestamps', () => {
  const d = fixture();
  for (const field of FIELDS) d.series_observed_at[field] = [(now + 5600) * 1000];
  assert.equal(parseSignals(d, now).oldest, now + 5600);
  d.series_observed_at.wec_wind_speed = [(now + 60000) * 1000];
  assert.equal(parseSignals(d, now).wind.observed, now + 60000);
  assert.throws(() => parseSignals(d, now - 1), /ahead; check the device clock/);
  d.series.wec_active_power = [null];
  assert.throws(() => parseSignals(d, now), /Missing or invalid wec_active_power reading/);
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
