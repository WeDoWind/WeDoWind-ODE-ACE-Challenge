# Turbine Vortex

A dependency-free living canvas artwork by charlie9578. Fly through a luminous tunnel shaped by measured rotor speed, wind speed, power and wind-vane angle. Cross-sections remember the conditions that formed them, grow towards the viewer, and pass beyond the screen. Stable main mappings help viewers learn to read the turbine through the artwork. All code, styling and assets belong to this folder; no build, keys or paid services are required.

## Reproduce

From the repository root run `python -m http.server 8000`, then open <http://localhost:8000/site/creations/turbine-vortex/>. To test the Pages path prefix, serve the repository's parent directory and visit `/WeDoWind-ODE-ACE-Challenge/site/creations/turbine-vortex/`. The deployed Pages URL omits `site/`: <https://wedowind.github.io/WeDoWind-ODE-ACE-Challenge/creations/turbine-vortex/>. It becomes available only after upstream merge and Pages deployment.

Pause motion freezes travel, history and trails while leaving live readings updating. Reduced-motion preferences start the artwork paused; Resume motion explicitly opts in. **Immerse** fills the screen; controls fade after six idle seconds and return with movement, touch or keyboard input. Keyboard focus keeps controls visible. Connection status stays visible, and stale/unavailable warnings retain the visible-history data timestamps. Hidden pages stop animation and polling. The optional **Read the wind** guide pairs visual meanings with live markers and labelled scales.

## Live data contract

Docs, OpenAPI, `/v1/sites`, `/v1/sites/ace/assets`, `/v1/families` and a live combined response verified on **13 October 2026**. Site `ace`, asset `wec-1`, family `wec_instantaneous`, resolution `1s`:

<https://ace-api.duckdns.org/v1/sites/ace/assets/wec-1/data/wec_instantaneous/latest?resolution=1s&fields=wec_rotor_speed,wec_wind_speed,wec_active_power,wec_wind_direction&limit=1>

- `wec_rotor_speed`: rpm; `wec_wind_speed`: m/s; `wec_active_power`: kW; `wec_wind_direction`: degrees, native OPC node `Vane`. The catalogue was checked on 13 October 2026; the four-signal live response, per-field observations and collection timestamps were rechecked on 15 October 2026. Signed vane angles are valid; a live response included -11.6 degrees. The catalogue does not specify its geographic reference, so the artwork makes no geographic compass claim.
- One shared, completion-based request every **2 seconds**, above the catalogue's 1-second minimum. Manual refresh shares the cooldown; no overlap. A 15-second timeout, exponential failure backoff up to 60 seconds, and HTTP 429 `Retry-After` apply. Separate visitors/tabs each generate their own traffic.
- Metadata was checked during development and is not repeatedly fetched by visitors. All four fields are requested together with `limit=1`.
- Each field must be finite with case-insensitive `Good` quality and a valid `series_observed_at` Unix microsecond timestamp, converted to milliseconds. Nulls, missing fields, invalid quality, invalid observation dates and regressing observations are rejected. Negative wind/RPM are rejected; signed power and vane angles remain visible. Valid zero is preserved. If the direction signal fails or is stale, the artwork rests rather than inventing a heading.
- **60 seconds** is the chosen stale threshold, not a server guarantee. Freshness uses the gap between each signal and the API data clock (the maximum of observation and valid collection timestamps), plus monotonic `performance.now()` time since that field last advanced. Duplicate responses cannot reset this timer. If collection timestamps are absent, initial absolute age is unknown; the newest observation anchors the relative age and lack of advancement is still detected. No comparison with the computer wall clock is used for validation or freshness; no ahead-of-computer warnings are shown. Old or stalled signals rest the artwork and emit a warning once per stale episode, while polling continues.
- The observation area shows oldest/newest timestamps and their span **for retained tunnel layers**, not time since fetch. Timestamps are from the data, formatted in the viewer's timezone. Raster afterimages can fade for about 1 second after a layer is discarded and are not counted in that span. Malformed/offline/timeout errors retain labelled readings, show a reason and emit a console warning; no demo fallback is used.
- Automatic polling reschedules when a browser timer fires before its monotonic deadline, rounded up to a whole millisecond. The old early-return path could silently strand the polling loop. Manual refresh shares the same rearming guard, cooldown, backoff and Retry-After restrictions. Tests reproduce early delivery for 10,000 poll cycles, in addition to overlap, stop/resume and rate-limit cases.

## Visual mapping

- **Rotor speed:** three trails 120° apart share the walls' retained phase. Angular velocity is `clamp(RPM,0,30) × 2π/60`, eased over 2.5 seconds: steady 12 RPM gives one turn per five seconds. The rotor graphic is hidden. A separate whole-scene roll adds 0.025 radians/second (one turn in about 4 minutes 11 seconds); apparent screen rotation includes both.
- **Wind speed:** `clamp(wind/15)` controls travel at `0.4 + 1.2 × level` depth units/second and light-wave spacing. Fifteen m/s is an artistic ceiling. Changes between distinct observations, divided by elapsed data seconds, drive roughness through `sqrt(clamp(abs(change)/0.5))`, eased over 1.2 seconds. Duplicate observations are ignored; gaps over 60 seconds reset the derivative. Roughness blends circles into irregular 12-sided polygons, amplified by 1.4 and capped at 1, with vertex displacement up to 16% of radius. Deformation grows downstream, leaving trail origins exact. Steady wind gradually replaces rough layers with smooth ones.
- **Power:** fixed colour uses `sqrt(clamp(power/4200))`, from violet through cyan to gold. The API introduction documents nominal power of 4,200 kW. Signed power remains visible; negative values map to the zero-generation colour. A five-minute 10th–90th percentile range, minimum span 250 kW and 30-second adaptation constant, adds at most ±6° of ring hue detail. Fixed colour and power targets ease over 2.5 seconds. Higher absolute power also increases streak density. Dynamic colour is optional, described below.
- **Brightness:** a time-weighted trailing 30-second power mean uses distinct observation timestamps and piecewise-constant readings. The current sample initially contributes zero duration. Brightness is `0.5 + 0.35 × clamp((power-mean)/max(25 kW,abs(mean)×0.05),-1,1)`, eased over 0.6 seconds. Above-average power brightens, below-average dims; the mean is neutral. Gaps over 60 seconds reset the mean. It drives the artwork internally without a separate numerical readout.
- **Direction:** signed vane angles use shortest-arc easing over eight seconds. The artistic heading is `clamp(4 × angle,-120°,120°)`. At depth `d=z/18`, bend strength is `4d(1-d)`; horizontal displacement uses `sin(heading)`, vertical uses `1-cos(heading)`, then both follow the whole-scene roll. The origin stays centred and a zero angle gives no bend. These are screen coordinates, not compass bearings.

## Geometry and memory

A cross-section is emitted every 0.65 seconds, retaining its wind, power, brightness, direction, colour and rotor phase as it travels toward the viewer. Twenty-four wall filaments and three distinct trails join the sections. Curves blend toward angular segments as wind roughness increases; the blade trails use 1–16 transient subdivisions between layers. Startup sections form a straight, smooth tunnel coloured by the first real reading. Live rotation, bend and roughness grow from the origin; startup geometry is a visual scaffold, not recorded pre-session history. No simulated observations or decorative eddies are added.

Active depth is 18 units. Projection uses `unit=1.25 × min(width,height)` and `radius=unit × (1/28.2 + 4 × (1/(z×28/18+0.2)-1/28.2))`, preserving a circular origin while spreading distant turns. Shared scaling keeps the bend independent of aspect ratio. Perspective expansion carries sections outside the viewport. Depth alone allows roughly 11–44 seconds of history; offscreen disposal can shorten this. The status shows the actual retained observation span.

Layers are removed past the near plane or when their polygon envelope is outside every viewport corner, allowing an 8-pixel stroke margin. Layer storage is capped at 140, each adaptive power buffer at 512 observations, and the power-mean buffer at 256. Expired layers have no persistent references. All history is in memory; no historical API request or persistent storage is used.

Rendering uses the visible canvas directly, capped at 30fps and device-pixel ratio two. Frame-rate-independent fading has a 0.19-second time constant, with echoes visible for about one second. Geometry is reused across rings and filaments. Pause freezes travel, roll, history and afterimages; resizing clears pixel trails while retaining history. Missing/stale data shows a static centred straight tunnel with no bend or twist, retaining labelled readings and frozen history for recovery. No external rendering libraries or image assets are needed.

## Attribution and licence

Data: Ambition Community Energy (ACE), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Citation verified against Zenodo metadata accessed 13 October 2026:

Plumley, Charlie; Garrad, Andrew; Burke, Wilf; Jonsson, Christian; Smirthwaite, Andrew (2026). *ACE Wind Turbine Data* (version 2026.09). Zenodo. Concept DOI: [10.5281/zenodo.22662372](https://doi.org/10.5281/zenodo.22662372).

Code and original canvas artwork/screenshot: MIT, see `LICENSE`. The poller is copied from the repository's `templates/ace-live.mjs`, with a conservative 60-second cooldown when a 429 response's `Retry-After` is missing or inaccessible through CORS. Readable numeric/date headers are honoured even when longer than 60 seconds. No third-party image assets or fonts.

## Validation

From the repository root:

```sh
node scripts/validate.mjs
node --test site/creations/turbine-vortex/signals.test.mjs site/creations/turbine-vortex/poller.test.mjs site/creations/turbine-vortex/tunnel.test.mjs
```

Tests cover parsing/quality, monotonic freshness, time-weighted power means, adaptive scales, RPM, circular projection, straight startup/no-data views, bend/roll, bounded hour-long histories and 10,000 early-timer polling cycles. Optional browser QA runs with `python site/creations/turbine-vortex/browser-check.py` after installing developer-only Playwright and Chromium. It checks the repository prefix, live data, invalid/stale/offline responses and recovery, polling cooldown/Retry-After, keyboard focus, widths from 320px to desktop, fullscreen controls, pause/reduced motion and both colour modes. It refreshes the gallery screenshot using real live readings; fixtures are used only in tests. Live browser checks were rerun on 15 October 2026. The gallery listing is separate from the official WeDoWind challenge comment.

## Optional dynamic colour

The Dynamic colour button switches between the default fixed 0–4,200 kW palette and a more expressive recent-power palette. Dynamic mode uses a separate five-minute buffer of distinct valid power observations (maximum 512), a smoothed 10th–90th percentile range, a 25 kW minimum span and a 30-second adaptation constant. The minimum span prevents tiny noise from filling the palette. Recent-range endpoints are visible beside the controls and on the legend; they may extend below zero at low generation. Actual readings remain unchanged. The dynamic colour position eases over 1.2 seconds, then travels with its historical layer, so past colour differences persist. Fixed and dynamic colour meanings are different; the current mode is always labelled. The toggle clears old pixel afterimages and redraws retained geometry, including while paused, without starting motion or making an API request. Reloading returns to fixed mode. No new API traffic or persistent storage is added.

## Optional turbine soundscape

Choose **Enable sound** to start an original Web Audio electro-mechanical drone,
minor arpeggio, delay and four-on-the-floor pulse. Volume starts at 25%; use the
labelled slider or **Mute sound**. No samples, downloads or dependencies are used.
Sound is an artistic sonification, not a recording of the turbine.

Rotor speed (rpm), clamped to 0–30, sets tempo to 72 + 3 × RPM beats/minute;
the arpeggio plays sixteenth notes and the kick plays each beat. Wind (0–15 m/s)
opens a low-pass filter from 180 to 3,180 Hz. Power (0–4,200 kW) increases drone
and note intensity using a square-root curve; negative power maps to minimum
intensity. Signed vane angle wraps to ±180° and pans left/right, capped at ±0.8.
The fixed A-minor harmony is composed, not measured. Zero readings remain valid
and produce a restrained idle texture. Filter, gain and pan changes are smoothed;
a master compressor limits peaks but volume remains the listener's choice.

Sound uses the existing validated four-field reading and shared poller, with no
additional API traffic. It fades out on pause, stale or invalid data and mute.
Hidden/closed pages suspend audio; a visible page resumes only previously enabled
sound. Browser interruptions may require another click on Enable sound. Reloading
resets sound to off. Current API docs, OpenAPI, sites/assets and instantaneous
field catalogue were rechecked on **27 October 2026**; endpoint, units, two-second
refresh and 60-second stale policy above remain unchanged.
