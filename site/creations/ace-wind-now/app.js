const ENDPOINT = 'https://ace-api.duckdns.org/v1/sites/ace/assets/wec-1/data/wecstd/latest?resolution=60s&fields=active_power_mean,wind_speed_mean&limit=1';
const STALE_MS = 5 * 60 * 1000;
const ui = Object.fromEntries(['power', 'wind', 'status', 'message', 'timestamp', 'refresh'].map(id => [id, document.getElementById(id)]));
let reading = null;
let failed = false;
let pending = false;

function parseReading(data) {
  const timestamp = data.timestamps?.[0];
  const power = data.series?.active_power_mean?.[0];
  const wind = data.series?.wind_speed_mean?.[0];
  // ACE timestamps are Unix microseconds, not JavaScript milliseconds.
  const time = timestamp / 1000;
  if (!Number.isFinite(timestamp) || !Number.isFinite(time) || !Number.isFinite(new Date(time).getTime()) || time > Date.now() + 60000 || !Number.isFinite(power) || !Number.isFinite(wind) || data.quality?.[0] !== 'good') throw new Error('No valid reading');
  for (const field of ['active_power_mean', 'wind_speed_mean']) {
    const quality = data.series_quality?.[field]?.[0];
    if (quality != null && quality !== 'good') throw new Error('Field quality is not good');
  }
  return { time, power, wind };
}
function render() {
  const stale = reading && Date.now() - reading.time > STALE_MS;
  const state = failed ? 'unavailable' : stale ? 'stale' : reading ? 'current' : 'loading';
  ui.status.dataset.state = state;
  ui.status.textContent = { unavailable: 'API unavailable', stale: 'Stale reading', current: 'Recent reading', loading: 'Loading' }[state];
  ui.message.textContent = failed ? (reading ? 'Could not refresh. Showing the last successful reading; it may be out of date.' : 'No reading available. We will retry automatically in one minute.') : stale ? 'This reading is more than five minutes old. It does not describe the turbine right now.' : reading ? 'A recent measurement, rather than an instantaneous output or turbine operating status.' : 'Fetching the latest ACE reading…';
  ui.power.textContent = reading ? reading.power.toLocaleString('en-GB', { maximumFractionDigits: 0 }) : '—';
  ui.wind.textContent = reading ? reading.wind.toLocaleString('en-GB', { maximumFractionDigits: 1 }) : '—';
  ui.timestamp.textContent = reading ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'long', timeZone: 'Europe/London' }).format(new Date(reading.time)) : 'Not available yet';
  if (reading) ui.timestamp.dateTime = new Date(reading.time).toISOString();
}
async function refresh() {
  if (pending) return;
  pending = true;
  ui.refresh.disabled = true;
  try {
    const response = await fetch(ENDPOINT, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!response.ok) throw new Error('API request failed');
    reading = parseReading(await response.json());
    failed = false;
  } catch { failed = true; }
  finally { pending = false; ui.refresh.disabled = false; render(); }
}
ui.refresh.addEventListener('click', refresh);
refresh();
setInterval(refresh, 60000);
setInterval(render, 10000);
