# Using live ACE data in a creation

Checked against the public API documentation and field catalogue on **1 October 2026**. Verify the current contract before building: [interactive docs](https://ace-api.duckdns.org/docs), [OpenAPI JSON](https://ace-api.duckdns.org/openapi.json), [sites](https://ace-api.duckdns.org/v1/sites), [ACE assets](https://ace-api.duckdns.org/v1/sites/ace/assets), [families/fields/units/polling recommendations](https://ace-api.duckdns.org/v1/families).

## Two useful latest-reading requests

Instantaneous turbine power and wind speed (poll no faster than once a second):

```text
https://ace-api.duckdns.org/v1/sites/ace/assets/wec-1/data/wec_instantaneous/latest?resolution=1s&fields=wec_active_power,wec_wind_speed&limit=1
```

60-second mean power and wind speed (poll once a minute):

```text
https://ace-api.duckdns.org/v1/sites/ace/assets/wec-1/data/wecstd/latest?resolution=60s&fields=active_power_mean,wind_speed_mean&limit=1
```

These are different signals: do not label instantaneous values as 60-second averages. Power is kW; wind speed is m/s. Both use parallel arrays: `timestamps[0]` and `series.<field>[0]`. Timestamps are Unix microseconds: use `new Date(timestamp / 1000)`. Instantaneous responses also have `series_quality.<field>[0]` and `series_observed_at.<field>[0]`. Quality may be `Good` or `good`; compare case-insensitively. Check each field's observation time, not just the row or collection time. Keep null/missing values unavailable rather than interpreting them as zero.

## A single shared poller

Copy [templates/ace-live.mjs](../templates/ace-live.mjs) into your creation folder. Import it from a module script; no dependency installation is needed. It starts at most one request per second per poller, prevents overlap, guards manual refresh, times out requests, backs off on errors, and respects `Retry-After` on HTTP 429. Slower feeds must use their longer recommended interval. Use just one instance for all your widgets; multiple pollers, visitors or tabs are separate sources of traffic.

A minimal usage example (provide `power`, `status` and `observed` elements in your HTML):

```js
import { createAcePoller } from './ace-live.mjs';
const endpoint = 'https://ace-api.duckdns.org/v1/sites/ace/assets/wec-1/data/wec_instantaneous/latest?resolution=1s&fields=wec_active_power,wec_wind_speed&limit=1';
const power = document.getElementById('power');
const status = document.getElementById('status');
const observed = document.getElementById('observed');
let lastTime = null;
let unavailable = false;
function showFreshness() {
  status.textContent = unavailable ? (lastTime === null ? 'Unavailable — no reading yet' : 'Unavailable — last valid reading retained') :
    lastTime === null ? 'Loading' : Date.now() - lastTime > 60000 ? 'Stale reading' : 'Recent reading';
}
const poller = createAcePoller({
  endpoint,
  onData(data) {
    const fields = ['wec_active_power', 'wec_wind_speed'];
    const times = fields.map(field => data.series_observed_at?.[field]?.[0]);
    if (fields.some((field, i) =>
      !Number.isFinite(data.series?.[field]?.[0]) ||
      String(data.series_quality?.[field]?.[0]).toLowerCase() !== 'good' ||
      !Number.isFinite(times[i]) ||
      !Number.isFinite(new Date(times[i] / 1000).getTime()) ||
      times[i] / 1000 > Date.now() + 60000
    )) throw new Error('Missing or invalid signal');
    lastTime = Math.min(...times) / 1000;
    power.textContent = `${data.series.wec_active_power[0]} kW`;
    observed.textContent = new Date(lastTime).toLocaleString('en-GB', { timeZone: 'Europe/London' });
    unavailable = false;
    showFreshness();
  },
  onError() { unavailable = true; showFreshness(); }
});
setInterval(showFreshness, 1000); // Updates labels only; makes no API requests.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) poller.stop(); else poller.start();
});
if (!document.hidden) poller.start();
// A manual refresh button must call poller.refresh(), never a separate fetch().
```

The one-minute stale threshold above is a display choice, not an API promise. Select and document one appropriate to your feed. A one-second resolution does not guarantee a new signal every second. A single latest request is enough for a card; fetch ranges only when you need a chart and respect pagination. Avoid fetching metadata on every refresh.

## Reproduction, credit and checks

Run `python -m http.server 8000 --directory site` from the repository root for static previews. Use relative asset links so your creation also works under `/WeDoWind-ODE-ACE-Challenge/`. Keep your changes within your own creation, screenshot and gallery entry; copy examples into your folder rather than modifying shared files.

Include a README and licence, endpoint and access date, refresh/stale behaviour, and ACE credit. Cite [ACE Wind Turbine Data, DOI: 10.5281/zenodo.22662372](https://doi.org/10.5281/zenodo.22662372) using verified Zenodo metadata. Data remains [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); your code licence is separate.

Check valid zero readings, missing data, bad quality, old per-field timestamps, API failures and recovery. Check that rapid manual clicks do not start extra requests. Inspect desktop/narrow screens and update the screenshot. Run `node scripts/validate.mjs` and report live-verification limitations in your PR. The gallery PR and the official WeDoWind Solutions comment are separate submissions.

Maintainers can verify the shared starter with `node scripts/test-ace-poller.mjs`. Contributors should copy it into their own folder and test their display’s rendering and data handling separately.
