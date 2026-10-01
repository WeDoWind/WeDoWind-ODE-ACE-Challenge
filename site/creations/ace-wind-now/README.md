# ACE Wind Now

A dependency-free card showing the ACE turbine's latest instantaneous active power (kW) and wind speed (m/s). The illustration is decorative and does not indicate rotor speed or operating status.

## Run and reproduce

From the repository root, run `python -m http.server 8000 --directory site`, then open http://localhost:8000/creations/ace-wind-now/. No build, packages, credentials, hardware, or paid services are required. An internet connection and a modern browser are needed for live data. HTML, CSS, and JavaScript are kept in this folder; relative asset links work beneath the repository's GitHub Pages prefix.

## Data and behaviour

- API documentation: https://ace-api.duckdns.org/docs (OpenAPI version 0.7.0 inspected on 1 October 2026).
- Live endpoint: https://ace-api.duckdns.org/v1/sites/ace/assets/wec-1/data/wec_instantaneous/latest?resolution=1s&fields=wec_active_power,wec_wind_speed&limit=1
- Access date: 1 October 2026. The endpoint and its public CORS headers were verified.
- Refresh interval: one second, matching the API's recommendation for this resolution. Requests time out after 15 seconds; overlapping requests are prevented, and manual refresh shares the one-second request cooldown. Failed requests use exponential backoff up to 60 seconds and HTTP 429 Retry-After is respected.
- The API timestamp is Unix microseconds, converted to milliseconds for display in Europe/London, including daylight saving. Readings older than one minute are labelled stale; freshness is rechecked every second, using the oldest of the two per-signal observation timestamps.
- Missing, non-finite, future-dated (over one minute), or non-good-quality readings are rejected. Fetch errors display an unavailable message and keep any last successful reading with its timestamp. Without a successful reading, values remain blank; no demonstration data is presented as live.
- Values are instantaneous API signals from the one-second feed, rounded only for display. No energy, income, emissions, operating-status, or community-impact calculations are made.

## ACE attribution and citation

Data supplied by [Ambition Community Energy (ACE)](https://ambitioncommunityenergy.org/), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Plumley, Charlie; Garrad, Andrew; Burke, Wilf; Jonsson, Christian; Smirthwaite, Andrew (2026). *ACE Wind Turbine Data* (2026.08_v2). Zenodo. [Version DOI: 10.5281/zenodo.22794387](https://doi.org/10.5281/zenodo.22794387).

[ACE dataset concept DOI: 10.5281/zenodo.22662372](https://doi.org/10.5281/zenodo.22662372). Citation metadata was checked against the Zenodo record on 1 October 2026.

## Licence and screenshot

Code and original inline turbine illustration: MIT, see LICENSE. The gallery screenshot is a capture of this display; the original design is MIT and the visible ACE readings remain CC BY 4.0 with attribution. No external image assets or fonts are used.

Creator credit uses the repository contributor handle `charlie9578`.

The display is hosted on the repository’s GitHub Pages site. A gallery pull request is separate from official challenge submission on WeDoWind.

## Checks

Run `node site/creations/ace-wind-now/test.mjs` from the repository root to check loading, valid zero values, freshness, failed refreshes, recovery, malformed data, and retained readings. Run `node scripts/validate.mjs` to validate the gallery entry. Desktop and mobile Chrome captures were inspected on 1 October 2026; the desktop capture successfully fetched live readings in-browser.
