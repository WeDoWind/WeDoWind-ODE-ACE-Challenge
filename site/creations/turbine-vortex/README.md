# Turbine Vortex

A dependency-free living canvas artwork by charlie9578. Measured rotor speed drives luminous spiral rotation, wind speed shapes outward pulses, and power colours the light. All code, styling and assets belong to this folder; no build, keys or paid services are required.

## Reproduce

From the repository root run `python -m http.server 8000`, then open <http://localhost:8000/site/creations/turbine-vortex/>. To test the Pages path prefix, serve the repository's parent directory and visit `/WeDoWind-ODE-ACE-Challenge/site/creations/turbine-vortex/`. The deployed Pages URL omits `site/`: <https://wedowind.github.io/WeDoWind-ODE-ACE-Challenge/creations/turbine-vortex/>. It becomes available only after upstream merge and Pages deployment.

Pause motion leaves live readings updating. Reduced-motion preferences start the artwork paused; Resume motion explicitly opts in. Fullscreen is optional. Hidden pages stop animation and polling.

## Live data contract

Docs, OpenAPI, `/v1/sites`, `/v1/sites/ace/assets`, `/v1/families` and a live combined response verified on **13 October 2026**. Site `ace`, asset `wec-1`, family `wec_instantaneous`, resolution `1s`:

<https://ace-api.duckdns.org/v1/sites/ace/assets/wec-1/data/wec_instantaneous/latest?resolution=1s&fields=wec_rotor_speed,wec_wind_speed,wec_active_power&limit=1>

- `wec_rotor_speed`: rpm; `wec_wind_speed`: m/s; `wec_active_power`: kW.
- One shared, completion-based request every **2 seconds**, above the catalogue's 1-second minimum. Manual refresh shares the cooldown; no overlap. A 15-second timeout, exponential failure backoff up to 60 seconds, and HTTP 429 `Retry-After` apply. Separate visitors/tabs each generate their own traffic.
- Metadata was checked during development and is not repeatedly fetched by visitors. The three fields are requested together with `limit=1`.
- Each field must be finite with case-insensitive `Good` quality and a valid `series_observed_at` Unix microsecond timestamp, converted to milliseconds. Nulls, missing fields, invalid quality, timestamps over 5 seconds in the future and regressing observations are rejected. Negative wind/RPM are rejected; negative active power remains visible. Valid zero is preserved.
- **60 seconds** is the chosen stale threshold for the oldest signal, not a server guarantee. Individual local observation times and the oldest full date are visible. Stale readings stay labelled; malformed/offline/error responses retain last valid numbers with an unavailable warning. Without valid data, numbers remain dashes. The vortex becomes a still, subdued neutral form. No demo fallback.

## Artistic mapping and adaptive scale

Rotor angular velocity is `RPM × 2π/60 × 0.55`, capped at 30 RPM as an artistic comfort bound. Rotation eases towards the measured speed with a 2.5-second time constant, including a transition to stillness at zero.

Wind and power each use five minutes of fresh, distinct observations collected since opening the page. Their 10th–90th percentile ranges resist spikes. The range centre/span adapt with a 30-second time constant. Minimum spans are **1.5 m/s** and **250 kW**; constant values map to the centre, not an extreme. Duplicate observations do not overweight the history. There is no historical API request. Normalized targets are clamped and eased over 2.5 seconds.

Wind sets pulse rate (0.09–0.25 cycles/second) and amplitude; zero wind stops pulses. Adaptive power sets a violet → cyan → gold palette. Absolute power adds brightness using `0.22 + 0.6 × sqrt(clamp(power/4200))`; the API introduction documents the turbine's 4.2 MW nominal power. These mappings express conditions rather than simulate turbine physics or energy totals.

## Attribution and licence

Data: Ambition Community Energy (ACE), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Citation verified against Zenodo metadata accessed 13 October 2026:

Plumley, Charlie; Garrad, Andrew; Burke, Wilf; Jonsson, Christian; Smirthwaite, Andrew (2026). *ACE Wind Turbine Data* (version 2026.09). Zenodo. Concept DOI: [10.5281/zenodo.22662372](https://doi.org/10.5281/zenodo.22662372).

Code and original canvas artwork/screenshot: MIT, see `LICENSE`. The poller is copied from the repository's `templates/ace-live.mjs`, with a conservative 60-second cooldown when a 429 response's `Retry-After` is missing or inaccessible through CORS. Readable numeric/date headers are honoured even when longer than 60 seconds. No third-party image assets or fonts.

## Validation

Run `node scripts/validate.mjs` from the repository root and `node --test site/creations/turbine-vortex/signals.test.mjs site/creations/turbine-vortex/poller.test.mjs` for signal, adaptive-range and poller checks. Optional browser QA uses `python site/creations/turbine-vortex/browser-check.py` (install developer-only `playwright` and its Chromium browser first). It starts and stops a temporary local server, checks the repository prefix, desktop/mobile, keyboard focus, pause/reduced motion, live readings, stale/invalid/offline responses, recovery, refresh cooldown and exposed `Retry-After`, and updates the gallery screenshot using actual live readings. Mock readings are used only in tests, never as a production fallback. All checks passed on 13 October 2026, including live browser access. The gallery listing is separate from the official WeDoWind challenge comment.
