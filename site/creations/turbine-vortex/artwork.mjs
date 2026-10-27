import { MIXER_SIGNALS, defaultMix, mixActive, mixReading } from './mixer.mjs';
import { Soundscape } from './soundscape.mjs';
import { TunnelRenderer } from './tunnel.mjs';
import { createAcePoller } from './ace-live.mjs';
import { ENDPOINT, AdaptiveRange, parseSignals, angleDifference, visualTargets, SignalFreshness, PowerAverage, WindChanges } from './signals.mjs';

const $ = id => document.getElementById(id);
const sound = new Soundscape();
let soundEnabled = false;
let mix = defaultMix();
const adjustedReading = () => mixReading(reading, mix);
for (const [key, spec] of Object.entries(MIXER_SIGNALS)) {
  const row = document.createElement('fieldset');
  row.innerHTML = `<legend>${spec.label}</legend>
    <label for="${key}-multiplier">Multiplier <output id="${key}-multiplier-value">1×</output></label>
    <input id="${key}-multiplier" type="range" min="0" max="3" step="0.1" value="1">
    <label for="${key}-offset">Offset (${spec.unit}) <output id="${key}-offset-value">0</output></label>
    <input id="${key}-offset" type="range" min="${spec.offsetMin ?? -spec.offset}" max="${spec.offset}" step="${spec.step}" value="0">
    <p id="${key}-mixed">Waiting for measured data</p>`;
  $('mixer-signals').append(row);
  for (const control of ['multiplier', 'offset']) {
    $(`${key}-${control}`).addEventListener('input', event => {
      mix[key][control] = Number(event.target.value);
      updateMixer(); updateSound(); updateColourScale(); forceDraw = true;
    });
  }
}
function updateMixer() {
  const adjusted = adjustedReading();
  const active = mixActive(mix);
  const message = active ? 'Exploration active · sound and visuals use adjusted values. Readings above remain measured.' : 'Original mapping · multipliers 1×, offsets 0';
  if ($('mixer-status').textContent !== message) $('mixer-status').textContent = message;
  document.querySelector('main').classList.toggle('mixing', active);
  for (const [key, spec] of Object.entries(MIXER_SIGNALS)) {
    $(`${key}-multiplier-value`).textContent = `${mix[key].multiplier.toFixed(1)}×`;
    $(`${key}-offset-value`).textContent = mix[key].offset;
    $(`${key}-mixed`).textContent = adjusted ? `Measured ${reading[key].value.toFixed(1)} → adjusted ${adjusted[key].value.toFixed(1)} ${spec.unit}` : 'Waiting for measured data';
  }
}
$('mixer-reset').addEventListener('click', () => {
  mix = defaultMix();
  for (const key of Object.keys(MIXER_SIGNALS)) {
    $(`${key}-multiplier`).value = 1; $(`${key}-offset`).value = 0;
  }
  updateMixer(); updateSound(); updateColourScale(); forceDraw = true;
});
function updateSound() {
  const active = soundEnabled && !resting && !paused && !document.hidden;
  sound.update(adjustedReading(), active);
  const message = soundEnabled ? active ? 'Sound live · RPM pulse / wind filter / power harmonics / vane stereo' : 'Sound resting · waiting for fresh data, visible page and running motion' : 'Sound off · opt in to the turbine soundscape';
  if ($('sound-status').textContent !== message) $('sound-status').textContent = message;
}
$('sound-toggle').addEventListener('click', async () => {
  $('sound-toggle').disabled = true;
  try {
    if (!soundEnabled) await sound.start();
    soundEnabled = !soundEnabled;
    $('sound-toggle').textContent = soundEnabled ? 'Mute sound' : 'Enable sound';
    $('sound-toggle').setAttribute('aria-pressed', String(soundEnabled));
    updateSound();
  } catch (error) { $('sound-status').textContent = `Sound unavailable: ${error.message}`; }
  finally { $('sound-toggle').disabled = false; }
});
$('sound-volume').addEventListener('input', event => { sound.volume = Number(event.target.value) / 100; updateSound(); });
setInterval(updateSound, 50);
const canvas = $('vortex'), tunnel = new TunnelRenderer(canvas);
const powerRange = new AdaptiveRange(250);
const colourRange = new AdaptiveRange(25);
let dynamicColour = false;
const freshness = new SignalFreshness(), powerAverage = new PowerAverage();
const windChanges = new WindChanges();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reading = null, unavailable = false, paused = reducedMotion.matches;
let width = 1, height = 1, previous = 0, frame, forceDraw = true;
const visual = { rpm: 0, wind: 0, power: 0, colourLevel: .5, brightness: .24, direction: 0, powerDetail: .5, turbulence: 0 };
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
  updateSound();
  updateMixer();
  document.querySelector('main').classList.toggle('data-resting', !!resting);
  const status = $('status');
  status.dataset.state = unavailable ? 'error' : stale ? 'stale' : 'fresh';
  const message = unavailable ? (reading ? 'Unavailable · last valid readings retained' : 'Unavailable · no valid readings') : stale ? 'Stale · last valid readings retained' : reading ? 'Live · ACE turbine / wec-1' : 'Connecting to ACE…';
  if (status.textContent !== message) status.textContent = message;
  $('mode').textContent = resting ? 'Artwork resting · ' + (unavailable ? 'data unavailable' : stale ? 'observations over 60 seconds old' : 'waiting for observations') : paused ? 'Motion paused · readings continue live' : 'Flying through recent turbine history · trails build over time';
  if (mixActive(mix)) $('mode').textContent += ' · Adjusted signals';
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
      powerRange.add(reading.power.value, reading.power.observed);
      colourRange.add(reading.power.value, reading.power.observed);
      powerAverage.add(reading.power.value, reading.power.observed);
      windChanges.add(reading.wind);
      if (!initialized) { Object.assign(visual, visualTargets(reading, .5, powerAverage.mean())); initialized = true; }
    }
    updateColourScale();
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
    const adjusted = adjustedReading();
    const mean = (powerAverage.mean() ?? reading.power.value) * mix.power.multiplier + mix.power.offset;
    const targets = visualTargets(adjusted, powerRange.normalize(adjusted.power.value), mean, windChanges.rate * mix.wind.multiplier);
    for (const key of ['rpm', 'wind', 'power', 'powerDetail']) visual[key] += (targets[key] - visual[key]) * ease;
    visual.colourLevel += (colourRange.normalize(adjusted.power.value) - visual.colourLevel) * (1 - Math.exp(-dt / 1.2));
    visual.brightness += (targets.brightness - visual.brightness) * (1 - Math.exp(-dt / .6));
    visual.turbulence += (targets.turbulence - visual.turbulence) * (1 - Math.exp(-dt / 1.2));
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
function updateColourScale() {
  const labels = $('power-labels').querySelectorAll('span');
  const low = (colourRange.center ?? 0) - colourRange.span / 2;
  const high = low + colourRange.span;
  const ready = colourRange.center !== null;
  $('colour-scale-status').textContent = dynamicColour
    ? ready ? `Colour: dynamic · recent range ${low.toFixed(0)}–${high.toFixed(0)} kW` : 'Colour: dynamic · waiting for readings'
    : 'Colour: fixed · 0–4,200 kW';
  const fixed = ['0 kW', '250', '1,000', '2,500', '4,200'];
  const endpoints = ready ? [`${low.toFixed(0)} kW`, `${high.toFixed(0)} kW`] : ['Recent low', 'Recent high'];
  const values = dynamicColour ? [endpoints[0], '', '', '', endpoints[1]] : fixed;
  labels.forEach((label, i) => {
    label.hidden = !values[i];
    label.textContent = values[i];
  });
  const adjusted = adjustedReading();
  if (adjusted) {
    $('power-marker').style.left = `${100 * (dynamicColour ? colourRange.normalize(adjusted.power.value) : Math.sqrt(Math.max(0, Math.min(1, adjusted.power.value / 4200))))}%`;
    $('wind-marker').style.left = `${adjusted.wind.value / 15 * 100}%`;
  }
}
$('colour-toggle').addEventListener('click', () => {
  dynamicColour = !dynamicColour;
  tunnel.dynamicColour = dynamicColour;
  $('colour-toggle').setAttribute('aria-pressed', String(dynamicColour));
  $('colour-toggle').textContent = `Dynamic colour: ${dynamicColour ? 'on' : 'off'}`;
  updateColourScale();
  forceDraw = true; draw(0);
});
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
  if (document.hidden) { poller.stop(); updateSound(); sound.suspend(); }
  else { if (soundEnabled) sound.start().catch(() => { soundEnabled = false; updateSound(); }); updateStatus(); poller.start(); frame = requestAnimationFrame(animate); }
});
addEventListener('pagehide', () => { sound.update(reading, false); sound.suspend(); poller.stop(); cancelAnimationFrame(frame); });
addEventListener('pageshow', event => { if (event.persisted && !document.hidden) { if (soundEnabled) sound.start().catch(() => {}); poller.start(); cancelAnimationFrame(frame); previous = 0; frame = requestAnimationFrame(animate); } });
new ResizeObserver(resize).observe(canvas);
setInterval(updateStatus, 1000); // Labels only; no API traffic.
updateStatus(); if (!document.hidden) { poller.start(); frame = requestAnimationFrame(animate); }
