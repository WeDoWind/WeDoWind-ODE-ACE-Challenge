import { TunnelRenderer } from './tunnel.mjs';
import { createAcePoller } from './ace-live.mjs';
import { ENDPOINT, AdaptiveRange, parseSignals, angleDifference, visualTargets, SignalFreshness, PowerAverage } from './signals.mjs';

const $ = id => document.getElementById(id);
const canvas = $('vortex'), tunnel = new TunnelRenderer(canvas);
const windRange = new AdaptiveRange(1.5), powerRange = new AdaptiveRange(250);
const freshness = new SignalFreshness(), powerAverage = new PowerAverage();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reading = null, unavailable = false, paused = reducedMotion.matches;
let width = 1, height = 1, previous = 0, frame, forceDraw = true;
const visual = { rpm: 0, wind: 0, power: 0, brightness: .24, direction: 0, windDetail: .5, powerDetail: .5 };
let initialized = false, lastFrame = 0, chromeTimer;
let resting = true;
let failureReason = '';
let wasStale = false;

function updateStatus() {
  const stale = reading && freshness.stale();
  if (stale && !wasStale) console.warn('Turbine Vortex: a signal is stale or has stopped advancing; polling continues automatically.');
  wasStale = !!stale;
  const nextResting = unavailable || !reading || stale;
  if (nextResting !== resting) forceDraw = true;
  resting = nextResting;
  document.querySelector('main').classList.toggle('data-resting', !!resting);
  const status = $('status');
  status.dataset.state = unavailable ? 'error' : stale ? 'stale' : 'fresh';
  const message = unavailable ? (reading ? 'Unavailable · last valid readings retained' : 'Unavailable · no valid readings') : stale ? 'Stale · last valid readings retained' : reading ? 'Live · ACE turbine / wec-1' : 'Connecting to ACE…';
  if (status.textContent !== message) status.textContent = message;
  $('mode').textContent = resting ? 'Artwork resting · ' + (unavailable ? 'data unavailable' : stale ? 'observations over 60 seconds old' : 'waiting for observations') : paused ? 'Motion paused · readings continue live' : 'Flying through recent turbine history · trails build over time';
  const range = tunnel.memory.timeRange();
  const observation = range ? `Visible history: ${new Date(range.oldest).toLocaleString()} → ${new Date(range.newest).toLocaleTimeString()} · ${((range.newest - range.oldest) / 1000).toFixed(1)}s span` : reading ? `Latest data: ${new Date(reading.newest).toLocaleString()} · history starts when motion runs` : 'No readings yet';
  $('observed').textContent = failureReason ? `Reason: ${failureReason}. ${observation}` : observation;
  $('pause').textContent = paused ? 'Resume motion' : 'Pause motion';
  $('pause').setAttribute('aria-pressed', String(paused));
}

const poller = createAcePoller({ endpoint: ENDPOINT, intervalMs: 2000,
  onData(data) {
    const next = parseSignals(data);
    if (reading && ['rpm', 'wind', 'power', 'direction'].some(key => next[key].observed < reading[key].observed)) throw new Error('Observation went backwards');
    reading = next; unavailable = false; failureReason = '';
    freshness.update(reading);
    for (const [key, decimals] of [['rpm', 2], ['wind', 2], ['power', 1], ['direction', 1]]) {
      $(key).textContent = reading[key].value.toFixed(decimals);
      $(key + '-time').textContent = new Date(reading[key].observed).toLocaleTimeString();
      $(key + '-time').dateTime = new Date(reading[key].observed).toISOString();
    }
    if (!freshness.stale()) {
      windRange.add(reading.wind.value, reading.wind.observed);
      powerRange.add(reading.power.value, reading.power.observed);
      powerAverage.add(reading.power.value, reading.power.observed);
      if (!initialized) { Object.assign(visual, visualTargets(reading, .5, .5, powerAverage.mean())); initialized = true; }
    }
    const mean = powerAverage.mean();
    $('power-change').textContent = mean === null ? '30s mean pending' : `Δ ${(reading.power.value - mean) >= 0 ? '+' : ''}${(reading.power.value - mean).toFixed(1)} kW vs ${mean.toFixed(1)} kW mean${powerAverage.coverageSeconds() < 30 ? ' (warming up)' : ''}`;
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
    const targets = visualTargets(reading, windRange.normalize(reading.wind.value), powerRange.normalize(reading.power.value), powerAverage.mean() ?? reading.power.value);
    for (const key of ['rpm', 'wind', 'power', 'windDetail', 'powerDetail']) visual[key] += (targets[key] - visual[key]) * ease;
    visual.brightness += (targets.brightness - visual.brightness) * (1 - Math.exp(-dt / .6));
    visual.direction += angleDifference(targets.direction, visual.direction) * (1 - Math.exp(-dt / 8));
  }
  // Travel is an artistic camera motion. Every layer retains the conditions at birth.
  tunnel.render(dt, { ...visual, observed: reading?.newest ?? null, oldestObserved: reading?.oldest ?? null }, { active, resting, force: forceDraw });
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
