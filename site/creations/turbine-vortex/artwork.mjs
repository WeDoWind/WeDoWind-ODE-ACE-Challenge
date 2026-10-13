import { createAcePoller } from './ace-live.mjs';
import { ENDPOINT, STALE_MS, AdaptiveRange, parseSignals, clamp } from './signals.mjs';

const $ = id => document.getElementById(id);
const canvas = $('vortex'), ctx = canvas.getContext('2d');
const windRange = new AdaptiveRange(1.5), powerRange = new AdaptiveRange(250);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reading = null, unavailable = false, paused = reducedMotion.matches;
let width = 1, height = 1, angle = 0, pulse = 0, previous = 0, frame;
const visual = { rpm: 0, wind: .5, power: .5, brightness: .25 };
let resting = true;

function updateStatus() {
  const stale = reading && Date.now() - reading.oldest > STALE_MS;
  resting = unavailable || !reading || stale;
  const status = $('status');
  status.dataset.state = unavailable ? 'error' : stale ? 'stale' : 'fresh';
  status.textContent = unavailable ? (reading ? 'Unavailable · last valid readings retained' : 'Unavailable · no valid readings') : stale ? 'Stale · last valid readings retained' : reading ? 'Live · ACE turbine / wec-1' : 'Connecting to ACE…';
  $('mode').textContent = resting ? 'Artwork resting · ' + (unavailable ? 'data unavailable' : stale ? 'observations over 60 seconds old' : 'waiting for observations') : paused ? 'Motion paused · readings continue live' : 'Live motion · scales adapting to recent conditions';
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
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(0);
}

function draw(dt) {
  const active = !resting && !paused;
  const ease = 1 - Math.exp(-dt / 2.5);
  if (active) {
    visual.rpm += (clamp(reading.rpm.value, 0, 30) - visual.rpm) * ease;
    visual.wind += (windRange.normalize(reading.wind.value) - visual.wind) * ease;
    visual.power += (powerRange.normalize(reading.power.value) - visual.power) * ease;
    // API-documented nominal power: 4200 kW. Brightness is an artistic mapping.
    visual.brightness += (.22 + .6 * Math.sqrt(clamp(reading.power.value / 4200)) - visual.brightness) * ease;
    angle += visual.rpm * Math.PI * 2 / 60 * .55 * dt;
    if (reading.wind.value > 0) pulse += (.09 + visual.wind * .16) * dt;
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#080c15'; ctx.fillRect(0, 0, width, height);
  const narrow = width < 680;
  const cx = width * (narrow ? .55 : .66), cy = height * (narrow ? .64 : .5);
  const radius = Math.min(width * .48, height * (narrow ? .32 : .53));
  const live = !resting && reading;
  const hue = live ? (visual.power < .5 ? 275 - visual.power * 170 : 190 - (visual.power - .5) * 300) : 220;
  const light = live ? visual.brightness : .16;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.4);
  halo.addColorStop(0, `hsla(${hue},75%,40%,${light * .15})`); halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height); ctx.globalCompositeOperation = 'lighter';
  // Deterministic filaments, never generated or simulated turbine readings.
  for (let i = 0; i < 64; i++) {
    const offset = i * Math.PI * 2 / 64;
    const breathe = live ? Math.sin(pulse * Math.PI * 2 + i * .035) * (.015 + visual.wind * .035) : 0;
    ctx.beginPath();
    for (let j = 0; j <= 105; j++) {
      const t = j / 105;
      const r = radius * (.065 + .94 * t) * (1 + breathe * Math.sin(t * Math.PI));
      const theta = offset + angle + 4.8 * (1 - t) + .17 * Math.sin(t * 12 + offset * 3);
      const x = cx + Math.cos(theta) * r, y = cy + Math.sin(theta) * r * .88;
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `hsla(${hue + Math.sin(offset * 2) * 32},80%,${52 + light * 20}%,${(.14 + light * .37) * (i % 3 ? .5 : 1)})`;
    ctx.lineWidth = i % 3 ? .65 : 1.35;
    ctx.shadowColor = `hsl(${hue},80%,60%)`; ctx.shadowBlur = i % 3 ? 0 : 9; ctx.stroke();
  }
  ctx.shadowBlur = 0;
  if (live && reading.wind.value > 0) {
    for (let i = 0; i < 3; i++) {
      const t = (pulse + i / 3) % 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, radius * (.1 + t), radius * (.1 + t) * .88, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue + 20},80%,70%,${Math.sin(t * Math.PI) * (.04 + visual.wind * .09)})`; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  const eye = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * .14);
  eye.addColorStop(0, '#060a12'); eye.addColorStop(.45, '#060a12'); eye.addColorStop(1, 'transparent');
  ctx.fillStyle = eye; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
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
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
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
