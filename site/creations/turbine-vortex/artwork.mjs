import { TunnelRenderer } from './tunnel.mjs';
import { createAcePoller } from './ace-live.mjs';
import { ENDPOINT, STALE_MS, AdaptiveRange, parseSignals, clamp } from './signals.mjs';

const $ = id => document.getElementById(id);
const canvas = $('vortex'), tunnel = new TunnelRenderer(canvas);
const windRange = new AdaptiveRange(1.5), powerRange = new AdaptiveRange(250);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reading = null, unavailable = false, paused = reducedMotion.matches;
let width = 1, height = 1, previous = 0, frame, forceDraw = true;
const visual = { rpm: 0, wind: .5, power: .5, brightness: .4 };
let resting = true;

function updateStatus() {
  const stale = reading && Date.now() - reading.oldest > STALE_MS;
  const nextResting = unavailable || !reading || stale;
  if (nextResting !== resting) forceDraw = true;
  resting = nextResting;
  const status = $('status');
  status.dataset.state = unavailable ? 'error' : stale ? 'stale' : 'fresh';
  status.textContent = unavailable ? (reading ? 'Unavailable · last valid readings retained' : 'Unavailable · no valid readings') : stale ? 'Stale · last valid readings retained' : reading ? 'Live · ACE turbine / wec-1' : 'Connecting to ACE…';
  $('mode').textContent = resting ? 'Artwork resting · ' + (unavailable ? 'data unavailable' : stale ? 'observations over 60 seconds old' : 'waiting for observations') : paused ? 'Motion paused · readings continue live' : 'Flying through recent turbine history · trails build over time';
  $('observed').textContent = reading ? `Oldest signal: ${new Date(reading.oldest).toLocaleString()} · ${Math.max(0, Math.floor((Date.now() - reading.oldest) / 1000))}s ago` : 'No readings yet';
  $('pause').textContent = paused ? 'Resume motion' : 'Pause motion';
  $('pause').setAttribute('aria-pressed', String(paused));
}

const poller = createAcePoller({ endpoint: ENDPOINT, intervalMs: 2000,
  onData(data) {
    const next = parseSignals(data);
    if (reading && ['rpm', 'wind', 'power'].some(key => next[key].observed < reading[key].observed)) throw new Error('Observation went backwards');
    reading = next; unavailable = false;
    for (const [key, decimals] of [['rpm', 2], ['wind', 2], ['power', 1]]) {
      $(key).textContent = reading[key].value.toFixed(decimals);
      $(key + '-time').textContent = new Date(reading[key].observed).toLocaleTimeString();
      $(key + '-time').dateTime = new Date(reading[key].observed).toISOString();
    }
    if (Date.now() - reading.oldest <= STALE_MS) {
      windRange.add(reading.wind.value, reading.wind.observed);
      powerRange.add(reading.power.value, reading.power.observed);
    }
    updateStatus();
  },
  onError() { unavailable = true; updateStatus(); }
});

function resize() {
  const bounds = canvas.getBoundingClientRect(); width = bounds.width; height = bounds.height;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  tunnel.resize(width, height, dpr); forceDraw = true; draw(0);
}

function draw(dt) {
  const active = !resting && !paused;
  const ease = 1 - Math.exp(-dt / 2.5);
  if (active) {
    visual.rpm += (clamp(reading.rpm.value, 0, 30) - visual.rpm) * ease;
    visual.wind += (windRange.normalize(reading.wind.value) - visual.wind) * ease;
    visual.power += (powerRange.normalize(reading.power.value) - visual.power) * ease;
    visual.brightness += (.4 + .5 * Math.sqrt(clamp(reading.power.value / 4200)) - visual.brightness) * ease;
  }
  // Travel is an artistic camera motion. Every layer retains the conditions at birth.
  tunnel.render(dt, { ...visual, observed: reading?.oldest ?? null }, { active, resting, force: forceDraw });
  forceDraw = false;
}

function animate(now) {
  const dt = previous ? Math.min((now - previous) / 1000, .1) : 0;
  previous = now; draw(dt); frame = requestAnimationFrame(animate);
}
$('pause').addEventListener('click', () => { paused = !paused; updateStatus(); });
reducedMotion.addEventListener('change', event => { paused = event.matches; updateStatus(); });
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  try { await poller.refresh(); } finally { $('refresh').disabled = false; }
});
if (!document.fullscreenEnabled) $('fullscreen').hidden = true;
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('main').requestFullscreen(); }
  catch { $('fullscreen').textContent = 'Fullscreen unavailable'; }
});
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Exit immersion' : 'Immerse'; });
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(frame); previous = 0;
  if (document.hidden) poller.stop();
  else { updateStatus(); poller.start(); frame = requestAnimationFrame(animate); }
});
addEventListener('pagehide', () => { poller.stop(); cancelAnimationFrame(frame); });
addEventListener('pageshow', event => { if (event.persisted && !document.hidden) { poller.start(); cancelAnimationFrame(frame); previous = 0; frame = requestAnimationFrame(animate); } });
new ResizeObserver(resize).observe(canvas);
setInterval(updateStatus, 1000); // Labels only; no API traffic.
updateStatus(); if (!document.hidden) { poller.start(); frame = requestAnimationFrame(animate); }
