import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements = Object.fromEntries(['power','wind','status','message','timestamp','refresh'].map(id => [id, { dataset: {}, addEventListener() {} }]));
let payload;
let broken = false;
let now = Date.now();
class Clock extends Date { static now() { return now; } }
const context = vm.createContext({ document: { getElementById: id => elements[id] }, Date: Clock, Intl, AbortSignal, setInterval() {}, fetch: async () => { if (broken) throw new Error('offline'); return {ok:true,json:async()=>payload}; } });
const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
// Prevent only the initial automatic fetch so each scenario controls its response.
vm.runInContext(source.replace('\nrefresh();\nsetInterval', '\nsetInterval'), context);
vm.runInContext('render()', context);
assert.equal(elements.status.textContent, 'Loading');
payload = { timestamps: [now * 1000], series: { active_power_mean: [0], wind_speed_mean: [0] }, quality: ['good'] };
await vm.runInContext('refresh()', context);
assert.equal(elements.status.textContent, 'Recent reading');
assert.equal(elements.power.textContent, '0');
assert.ok(elements.timestamp.dateTime.endsWith('Z'));
now += 301000;
vm.runInContext('render()', context);
assert.equal(elements.status.textContent, 'Stale reading');
broken = true;
await vm.runInContext('refresh()', context);
assert.equal(elements.status.textContent, 'API unavailable');
assert.equal(elements.power.textContent, '0');
assert.match(elements.message.textContent, /last successful/);
broken = false;
payload.timestamps = [now * 1000];
payload.series.active_power_mean = [1278];
await vm.runInContext('refresh()', context);
assert.equal(elements.status.textContent, 'Recent reading');
assert.equal(elements.power.textContent, '1,278');
for (const invalid of [null, {}, {...payload, quality:['bad']}, {...payload, timestamps:[(now+120000)*1000]}, {...payload, series:{active_power_mean:[null],wind_speed_mean:[7]}}, {...payload,series_quality:{active_power_mean:['bad']}}]) {
  payload = invalid;
  await vm.runInContext('refresh()', context);
  assert.equal(elements.status.textContent, 'API unavailable');
  assert.equal(elements.power.textContent, '1,278');
}
vm.runInContext('reading = null; render()', context);
assert.equal(elements.power.textContent, '—');
assert.match(elements.message.textContent, /No reading available/);
console.log('Passed: loading, zero values, recent, stale, offline, recovery, invalid data, retained reading, empty fallback.');
