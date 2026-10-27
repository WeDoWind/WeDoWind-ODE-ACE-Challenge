import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMix, mixReading, mixActive } from './mixer.mjs';
import { soundTargets } from './soundscape.mjs';
import { visualTargets } from './signals.mjs';

test('exploration preserves measurements and observation timestamps while driving both outputs', () => {
  const measured = { rpm: { value: 12, observed: 100 }, wind: { value: 5, observed: 200 },
    power: { value: 1000, observed: 300 }, direction: { value: -10, observed: 400 }, newest: 400 };
  const original = structuredClone(measured), mix = defaultMix();
  assert.deepEqual(mixReading(measured, mix), measured);
  assert.equal(mixActive(mix), false);
  mix.wind = { multiplier: 2, offset: 1 };
  const adjusted = mixReading(measured, mix);
  assert.equal(adjusted.wind.value, 11);
  assert.equal(adjusted.wind.observed, 200);
  assert.equal(adjusted.newest, 400);
  assert.deepEqual(measured, original);
  assert.ok(soundTargets(adjusted).pitchCents > soundTargets(measured).pitchCents);
  assert.ok(visualTargets(adjusted).wind > visualTargets(measured).wind);
  assert.equal(mixActive(mix), true);
});

test('offset holds, zero, signed power, bounds and wrapping remain well-defined', () => {
  const measured = Object.fromEntries(['rpm','wind','power','direction'].map(k => [k,{value:10,observed:100}]));
  const mix = defaultMix();
  mix.rpm = { multiplier: 0, offset: 15 };
  mix.wind = { multiplier: 0, offset: -10 };
  mix.power = { multiplier: 0, offset: -100 };
  mix.direction = { multiplier: 3, offset: 180 };
  const result = mixReading(measured, mix);
  assert.equal(result.rpm.value, 15); assert.equal(result.wind.value, 0);
  assert.equal(result.power.value, -100); assert.equal(result.direction.value, -150);
  mix.wind = { multiplier: 3, offset: 10 };
  assert.equal(mixReading(measured, mix).wind.value, 15);
  assert.equal(mixReading(null, mix), null);
});
