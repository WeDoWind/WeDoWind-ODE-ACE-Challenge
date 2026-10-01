const ENDPOINT = 'https://ace-api.duckdns.org/v1/sites/ace/assets/wec-1/data/wec_instantaneous/latest?resolution=1s&fields=wec_active_power,wec_wind_speed&limit=1';
const STALE_MS = 60 * 1000;
const ui = Object.fromEntries(['power', 'wind', 'status', 'message', 'timestamp', 'refresh'].map(id => [id, document.getElementById(id)]));
let reading = null;
let failed = false;
let pending = false;
let nextAllowed = -Infinity;
let failures = 0;

function parseReading(data) {
  const timestamp = data.timestamps?.[0];
  const power = data.series?.wec_active_power?.[0];
  const wind = data.series?.wec_wind_speed?.[0];
  // ACE timestamps are Unix microseconds, not JavaScript milliseconds.
  const time = timestamp / 1000;
  if (!Number.isFinite(timestamp) || !Number.isFinite(time) || !Number.isFinite(new Date(time).getTime()) || time > Date.now() + 60000 || !Number.isFinite(power) || !Number.isFinite(wind) || String(data.quality?.[0]).toLowerCase() !== 'good') throw new Error('No valid reading');
  for (const field of ['wec_active_power', 'wec_wind_speed']) {
    const quality = data.series_quality?.[field]?.[0];
    if (String(quality).toLowerCase() !== 'good') throw new Error('Field quality is not good');
  }
  const observed = ['wec_active_power', 'wec_wind_speed'].map(field => data.series_observed_at?.[field]?.[0]);
  if (observed.some(value => !Number.isFinite(value) || !Number.isFinite(new Date(value / 1000).getTime()) || value / 1000 > Date.now() + 60000)) throw new Error('Invalid observation time');
  // Use the oldest signal observation so a fresh row cannot hide an old field.
  return { time: Math.min(time, ...observed.map(value => value / 1000)), power, wind };
}
function render() {
  const stale = reading && Date.now() - reading.time > STALE_MS;
  const state = failed ? 'unavailable' : stale ? 'stale' : reading ? 'current' : 'loading';
  ui.status.dataset.state = state;
  ui.status.textContent = { unavailable: 'API unavailable', stale: 'Stale reading', current: 'Recent reading', loading: 'Loading' }[state];
  ui.message.textContent = failed ? (reading ? 'Could not refresh. Showing the last successful reading; it may be out of date.' : 'No reading available. We will retry automatically.') : stale ? 'This reading is more than one minute old. It does not describe the turbine right now.' : reading ? 'Latest instantaneous signals from the one-second feed. This is not a turbine operating-status report.' : 'Fetching the latest ACE reading…';
  ui.power.textContent = reading ? reading.power.toLocaleString('en-GB', { maximumFractionDigits: 0 }) : '—';
  ui.wind.textContent = reading ? reading.wind.toLocaleString('en-GB', { maximumFractionDigits: 1 }) : '—';
  ui.timestamp.textContent = reading ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'long', timeZone: 'Europe/London' }).format(new Date(reading.time)) : 'Not available yet';
  if (reading) ui.timestamp.dateTime = new Date(reading.time).toISOString();
}
async function refresh() {
  if (pending || performance.now() < nextAllowed) return;
  nextAllowed = performance.now() + 1000;
  pending = true;
  ui.refresh.disabled = true;
  try {
    const response = await fetch(ENDPOINT, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After');
        const seconds = retry == null ? NaN : Number(retry);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now();
        if (Number.isFinite(delay)) nextAllowed = Math.max(nextAllowed, performance.now() + delay);
      }
      throw new Error('API request failed');
    }
    reading = parseReading(await response.json());
    failed = false;
    failures = 0;
  } catch {
    failed = true;
    failures++;
    nextAllowed = Math.max(nextAllowed, performance.now() + Math.min(60000, 1000 * 2 ** Math.min(failures, 6)));
  }
  finally { pending = false; ui.refresh.disabled = false; render(); }
}
ui.refresh.addEventListener('click', refresh);
refresh();
setInterval(refresh, 1000);
setInterval(render, 1000);
