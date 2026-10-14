import { TunnelRenderer } from './tunnel.mjs';
import { createAcePoller } from './ace-live.mjs';
import { ENDPOINT, STALE_MS, AdaptiveRange, parseSignals, angleDifference, visualTargets } from './signals.mjs';

const $ = id => document.getElementById(id);
const canvas = $('vortex'), tunnel = new TunnelRenderer(canvas);
const windRange = new AdaptiveRange(1.5), powerRange = new AdaptiveRange(250);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reading = null, unavailable = false, paused = reducedMotion.matches;
let width = 1, height = 1, previous = 0, frame, forceDraw = true;
const visual = { rpm: 0, wind: 0, power: 0, brightness: .24, direction: 0, windDetail: .5, powerDetail: .5 };
let initialized = false, lastFrame = 0, chromeTimer;
let resting = true;
let failureReason = '';

function updateStatus() {
  const stale = reading && Date.now() - reading.oldest > STALE_MS;
  const nextResting = unavailable || !reading || stale;
  if (nextResting !== resting) forceDraw = true;
  resting = nextResting;
  document.querySelector('main').classList.toggle('data-resting', !!resting);
  const status = $('status');
  status.dataset.state = unavailable ? 'error' : stale ? 'stale' : 'fresh';
  const message = unavailable ? (reading ? 'Unavailable · last valid readings retained' : 'Unavailable · no valid readings') : stale ? 'Stale · last valid readings retained' : reading ? 'Live · ACE turbine / wec-1' : 'Connecting to ACE…';
  if (status.textContent !== message) status.textContent = message;
  $('mode').textContent = resting ? 'Artwork resting · ' + (unavailable ? 'data unavailable' : stale ? 'observations over 60 seconds old' : 'waiting for observations') : paused ? 'Motion paused · readings continue live' : 'Flying through recent turbine history · trails build over time';
  const ageSeconds = reading ? Math.floor((Date.now() - reading.oldest) / 1000) : 0;
  const observation = reading ? `Oldest signal: ${new Date(reading.oldest).toLocaleString()} · ${Math.abs(ageSeconds)}s ${ageSeconds < 0 ? 'ahead' : 'ago'}` : 'No readings yet';
  const aheadSeconds = reading ? Math.ceil((Math.max(...['rpm', 'wind', 'power', 'direction'].map(key => reading[key].observed)) - Date.now()) / 1000) : 0;
  const clockNote = !unavailable && aheadSeconds > 5 ? `Clock difference: signal timestamps ${aheadSeconds}s ahead. ` : '';
  $('observed').textContent = failureReason ? `Reason: ${failureReason}. ${observation}` : clockNote + observation;
  $('pause').textContent = paused ? 'Resume motion' : 'Pause motion';
  $('pause').setAttribute('aria-pressed', String(paused));
}

const poller = createAcePoller({ endpoint: ENDPOINT, intervalMs: 2000,
  onData(data) {
    const next = parseSignals(data);
    if (reading && ['rpm', 'wind', 'power', 'direction'].some(key => next[key].observed < reading[key].observed)) throw new Error('Observation went backwards');
    reading = next; unavailable = false; failureReason = '';
    for (const [key, decimals] of [['rpm', 2], ['wind', 2], ['power', 1], ['direction', 1]]) {
      $(key).textContent = reading[key].value.toFixed(decimals);
      $(key + '-time').textContent = new Date(reading[key].observed).toLocaleTimeString();
      $(key + '-time').dateTime = new Date(reading[key].observed).toISOString();
    }
    if (Date.now() - reading.oldest <= STALE_MS) {
      windRange.add(reading.wind.value, reading.wind.observed);
      powerRange.add(reading.power.value, reading.power.observed);
      if (!initialized) { Object.assign(visual, visualTargets(reading)); initialized = true; }
    }
    $('power-marker').style.left = `${Math.sqrt(Math.max(0, Math.min(1, reading.power.value / 4200))) * 100}%`;
    $('wind-marker').style.left = `${Math.max(0, Math.min(1, reading.wind.value / 15)) * 100}%`;
    updateStatus();
  },
  onError(error) {
    unavailable = true;
    failureReason = error.name === 'AbortError' ? 'Request timed out after 15 seconds' : error instanceof TypeError ? 'Network request failed; check your connection or API availability' : error.message;
    console.warn('Turbine Vortex data unavailable:', error);
    updateStatus();
  }
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
    const targets = visualTargets(reading, windRange.normalize(reading.wind.value), powerRange.normalize(reading.power.value));
    for (const key of ['rpm', 'wind', 'power', 'brightness', 'windDetail', 'powerDetail']) visual[key] += (targets[key] - visual[key]) * ease;
    visual.direction += angleDifference(targets.direction, visual.direction) * (1 - Math.exp(-dt / 8));
  }
  // Travel is an artistic camera motion. Every layer retains the conditions at birth.
  tunnel.render(dt, { ...visual, observed: reading?.oldest ?? null }, { active, resting, force: forceDraw });
  forceDraw = false;
}

function animate(now) {
  // Limit raster work to 30fps for long viewing sessions; use elapsed time for motion.
  if (now - lastFrame < 1000 / 30) { frame = requestAnimationFrame(animate); return; }
  lastFrame = now;
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
$('fullscreen').addEventListener('click', async event => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('main').requestFullscreen(); }
  catch { $('fullscreen').textContent = 'Fullscreen unavailable'; }
  if (event.detail > 0) $('fullscreen').blur(); // Keep keyboard focus; let pointer users enter a quiet view.
});
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Exit immersion' : 'Immerse'; });
function revealChrome() {
  const main = document.querySelector('main');
  main.classList.remove('quiet'); clearTimeout(chromeTimer);
  if (document.fullscreenElement) chromeTimer = setTimeout(() => main.classList.add('quiet'), 6000);
}
document.addEventListener('fullscreenchange', revealChrome);
document.addEventListener('pointermove', revealChrome);
document.addEventListener('pointerdown', revealChrome);
document.addEventListener('keydown', revealChrome);
document.addEventListener('focusin', revealChrome);
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
