import test from 'node:test';
import assert from 'node:assert/strict';
import { soundTargets, Soundscape } from './soundscape.mjs';
const reading = rpm => ({ rpm: { value: rpm }, wind: { value: 5 }, power: { value: 1000 }, direction: { value: 0 } });

test('tempo is directly proportional to RPM and reaches zero', () => {
  for (const rpm of [0, .01, 1, 6, 12, 30]) assert.equal(soundTargets(reading(rpm)).bpm, rpm * 9);
});

test('zero RPM repeatedly stops rhythmic scheduling without an infinite interval', () => {
  const sound = new Soundscape();
  const param = { setTargetAtTime() {} };
  sound.context = { currentTime: 1, createOscillator() { throw Error('No voices should be scheduled at zero'); } };
  sound.master = { gain: param }; sound.pitch = { offset: param };
  sound.filter = { frequency: param }; sound.pan = { pan: param }; sound.drone = { gain: param };
  sound.next = 1000; sound.step = 4;
  for (let i = 0; i < 100; i++) sound.update(reading(0), true);
  assert.equal(sound.next, null); assert.equal(sound.step, 0); assert.equal(sound.lastBpm, 0);
  // A faster rotor shortens the remaining wait instead of retaining a slow-RPM deadline.
  sound.next = 11; sound.lastBpm = 9;
  sound.update(reading(2), true);
  assert.equal(sound.next, 6);
  assert.equal(sound.lastBpm, 18);
});
