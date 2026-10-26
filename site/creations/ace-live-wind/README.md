# ACE Live Wind — Digital Twin, Community Stories & Status Explainer

**Creators:** Vanesa Magar and Víctor M. Godínez-Sandoval.

A full-screen, dependency-free public display for the Ambition Community
Energy (ACE) wind turbine in Lawrence Weston, Bristol, designed for a
screen in a community space. It combines:

- an **animated digital twin** of the turbine whose rotor speed and nacelle
  direction follow the live one-second feed, with a sky that follows the
  local time of day;
- the **turbine tower as a live power gauge** (fill height = current kW ÷
  4,245 kW rated capacity), plus an amber marker and floating card showing
  the exact **metered energy of the last hour** with everyday equivalents
  (homes, kettles, phone charges…), CO₂ avoided and an illustrative £ value;
- a **live info overlay** (connection status, wind, lifetime energy, "today's
  estimated income") and a **17-signal "Explore more data" panel** with
  on-demand history charts;
- a **Story & Impact Dock** with five community pop-up topics (health, local
  wealth, scale, the grid, clean air and warm homes);
- a **"What's it doing right now?" status explainer** that turns the most
  common passer-by question — *"why isn't it moving?"* — into a short,
  honest, plain-English answer, with a "Turbine specs" sub-panel; and
- the official ACE credits box linking to the live ACE dashboard.

The display was developed in the authors' working repository
[vmagar-CICESE/ACE_Wind_Turbine_Public_Communication_Display](https://github.com/vmagar-CICESE/ACE_Wind_Turbine_Public_Communication_Display)
(as "Concept 8", the final iteration of a series of concepts) with the help
of AI coding agents (mainly Claude Sonnet). The copy in this folder is the
same code, unchanged apart from this README and the licence credit line.

## Run and reproduce

From the repository root, run `python -m http.server 8000 --directory site`,
then open <http://localhost:8000/creations/ace-live-wind/>. There is no
build step, no package, no credential, no hardware and no paid service.
An internet connection and a modern browser (ES modules, `fetch`, `Intl`
time zones, CSS `backdrop-filter`) are needed for live data. All HTML, CSS
and JavaScript live in this folder and use relative paths, so the display
works beneath the repository's GitHub Pages path prefix. It is designed for a
landscape 16:9 screen (checked at 1920×1080) and degrades to a scrolling
right-hand rail on shorter screens.

Live copy: <https://vmagar-cicese.github.io/ACE_Wind_Turbine_Public_Communication_Display/solutions/concept-8-status-explainer/>

## Data and behaviour

- API documentation: <https://ace-api.duckdns.org/docs> and
  <https://ace-api.duckdns.org/openapi.json>. Endpoints, fields and
  recommended refresh intervals were checked against the live API during
  development (October 2026); the display was last verified live in a
  browser on 26 October 2026.
- All ACE requests target site `ace`, asset `wec-1`. The endpoints, their
  resolution and refresh rate are listed in the two **Live ACE data** tables
  below. The main feed is
  `.../data/wec_instantaneous/latest?resolution=1s&fields=…&limit=1`, which
  fetches all 18 instantaneous fields in **one** request per second and is
  shared by every widget on the page.
- Polling uses a completion-based loop (`ace-live.mjs`, adapted from the
  challenge's `templates/ace-live.mjs`): a 15-second request timeout, no
  overlapping requests, exponential back-off up to 60 seconds on failures,
  and HTTP 429 `Retry-After` honoured. Polling pauses while the browser tab
  is hidden and resumes when it is visible again.
- **Request budget.** The one-second feed is the only per-second request. The
  other ACE endpoints are fetched once at load, once an hour (availability),
  once a minute (10-minute `wecstd` family; one historical energy point),
  every 15 minutes (today's energy anchor) or on demand (history charts), so
  the display averages just over one ACE request per second, occasionally
  two in the same second when a slow refresh coincides with the main feed.
- Freshness uses the API's observation timestamps (`series_observed_at`,
  Unix microseconds → milliseconds), not browser fetch time, and each field's
  `series_quality`. The main feed is labelled **stale** when its newest
  reading is more than 15 seconds old; the 10-minute `wecstd` values after
  20 minutes. Null or non-good readings are shown as "—", never as zero;
  valid zero values (e.g. 0 kW in calm air) are preserved.
- If a request fails, the overlay switches to a red **Offline — showing last
  known reading** state and the last valid values stay visible with that
  warning; before any successful reading it shows **Unavailable — waiting
  for first reading** with blank values. No demonstration data is ever
  presented as live.
- Two **non-ACE public data sources** are used only for the relatable
  equivalences, each refreshed every 5 minutes and each clearly labelled as
  an estimate rather than an ACE figure: the National Grid ESO
  [Carbon Intensity API](https://carbonintensity.org.uk/)
  (`https://api.carbonintensity.org.uk/intensity`) for CO₂ avoided, and the
  Elexon BMRS Market Index Price
  (`https://data.elexon.co.uk/bmrs/api/v1/balancing/pricing/market-index`)
  for the illustrative £ value. If either is unavailable, the corresponding
  ticker item is simply omitted.
- Times are shown in Europe/London, including daylight saving. "Today so
  far" starts at local midnight computed from the IANA time-zone database,
  not a fixed UTC offset.

## ACE attribution and citation

Data supplied by [Ambition Community Energy (ACE)](https://ambitioncommunityenergy.org/),
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The display
credits ACE on screen and links to the official live dashboard.

[ACE dataset concept DOI: 10.5281/zenodo.22662372](https://doi.org/10.5281/zenodo.22662372).
Please cite the dataset using the citation metadata on that Zenodo record.

## Licence

Code (HTML, CSS, JavaScript, the inline SVG turbine and sky illustration):
MIT, see [LICENSE](LICENSE). The ACE readings shown on screen remain CC BY
4.0 with attribution. No external image assets or web fonts are used. The
gallery screenshot is a capture of this display taken by the authors.

The remaining sections describe the design decisions behind the display,
in particular what it deliberately avoids claiming.

## Why a status explainer?

The single most common question a passer-by asks about a wind turbine is
*"why isn't it moving?"* — usually on a calm day, or occasionally in very
strong wind. Without an explanation, a stationary turbine can look broken
even when it's working exactly as designed. The status explainer turns that
moment of confusion into a short, honest, plain-English teaching moment,
using live signals the rest of the display already trusts and shows.

Collapsed by default (so it doesn't compete with the Story Dock above it),
it shows a one-line headline with a coloured icon; tapping it expands a short
explanation.

## How the explanation is generated — and what it deliberately avoids

ACE's API exposes a turbine status-event feed (`main_status`, `substatus`,
`fault_message_flag`, `warning_message_flag`, `service_flag`), but **ACE does
not publish a decoder for what each numeric code means** (confirmed via
`/v1/event-families`, which lists only field names, no meanings). Inventing a
mapping from these undocumented codes to specific claims (e.g. "code 3 means
a gearbox fault") would be fabricating facts the API doesn't actually provide
— something the challenge's own contributor guidance explicitly warns
against.

Instead, the plain-English headline is generated entirely from three signals
that are already live-polled every second for the rest of the display (no
extra request needed): **wind speed**, **rotor speed**, and **power output**.

| Headline | Condition | Icon |
|---|---|---|
| Generating electricity | Rotor turning (≥ 1 rpm) and producing power | 🌀 |
| Resting — not enough wind | Not turning; wind below ~3.5 m/s | 🍃 |
| Paused — strong-wind safety stop | Not turning; wind above ~20 m/s | ⚠️ |
| Not generating right now | Not turning; wind in between | ⏸️ |

The ~3.5 m/s and ~20 m/s thresholds are general wind-industry ballpark
figures used only to choose a sensible explanation, **not** an assertion
about this specific turbine's certified cut-in/cut-out specification — that
exact figure isn't published anywhere in ACE's API or public materials that
could be verified for this build.

A second, collapsed-by-default **"Turbine specs"** sub-panel shows a short
spec sheet — model, serial number, rated power, commissioning date, and
location — pulled directly from the turbine's own configuration record on
the ACE API, not estimated or looked up elsewhere. This replaced an earlier
version of this panel that showed the raw, undocumented status/fault codes
instead; those codes turned out to add little value for a public audience
since they can't be meaningfully interpreted without an official decoder (the
earlier iteration is in the authors' working repository history).

The specs panel also adds four **manufacturer-verified reference figures**
(rotor diameter, swept area, hub height, tip height) below the live API
fields, visually separated and sourced from Enercon's own E-115 data sheet
and Wikipedia's citation-backed technical write-up for this specific
turbine, rather than the live API. This also corrects an earlier mistaken
guess at the model (E-126/EP3) — the installed turbine is an **Enercon
E-115 EP3**: a 115.7m rotor on a 92m hub, reaching the 150m tip height ACE
itself advertises (150m is tip height, not hub height — Enercon's own E-115
data sheet lists 149m as a separate, taller hub-height option for a
different, lower-wind-class variant, not the one installed here).

## The tower now shows two things: instantaneous power *and* the last hour

The tower's live fill is an **instantaneous power gauge**: full height =
4,245 kW rated capacity, current height = `wec_active_power ÷ 4,245 kW`. That
is genuinely a kW-scaled, fast-moving reading, and deliberately stays that
way — it is what lets the tower feel "live".

But a single instantaneous kW reading taken on a gusty day can look wildly
unrepresentative of what the turbine is actually delivering. So a second,
amber, dashed marker line is now drawn on the tower showing **the average
output over the last hour**, and a floating card beside the tower spells out
the exact kWh. Both share the tower's own 0–4,245 kW scale without changing
its meaning, because of one bit of unit arithmetic: kWh generated over
exactly one hour is numerically identical to an *average* kW over that hour
(`kWh ÷ 1h = kW`). So the last hour's kWh is converted back into an implied
average kW and plotted on the same axis as the live fill — the dashed line
stays visible even when the live (brighter) fill currently covers that height,
so you can always compare "right now" against "the last hour" in one glance.

**The last-hour kWh itself is exact, not estimated.** `wec_energy_exported`
is a cumulative lifetime meter (confirmed live against the API: it only ever
rises), so `(reading now) − (reading ~60 minutes ago)` is the turbine's own
metered output for that hour — fetched once a minute via the documented
`.../data/wec_instantaneous/range` endpoint, not approximated from average
instantaneous power.

### Making an abstract kWh figure relatable

Beside the kWh figure, a small ticker cycles through a few everyday
equivalents computed from that same exact last-hour kWh: UK homes' typical
hourly electricity use, kettle boils, hours of PlayStation gameplay, phone
charges, and LED-bulb hours. These conversion factors are well-established
public reference figures (Ofgem's Typical Domestic Consumption Value for
homes; Energy Saving Trust/manufacturer-typical draws for the appliances) —
**not** specific to this turbine or independently re-verified for this
project, used only to make the number relatable, consistent with this
display's policy of not inventing unverifiable turbine-specific facts (see
`APPLIANCE_EQUIVALENTS` in `app.js` for the exact factors and sources).

### Why there's no £ *income* figure (only an illustrative £ estimate)

ACE sells its output to OVO Energy under what is almost certainly a
commercial, confidential power purchase agreement — the actual sale price
isn't published anywhere in ACE's API or public materials, so there's no way
to show ACE's *real* income without fabricating a number. Instead, the
ticker includes two honestly-sourced proxies, each clearly labelled as not
being ACE's real figure:

- **An illustrative £ value**, using the GB wholesale electricity "Market
  Index Price" (£/MWh, half-hourly) from
  [Elexon's Balancing Mechanism Reporting Service](https://bmrs.elexon.co.uk/) —
  the free, public, official reference price generators are actually settled
  against in the GB market. This is a deliberately different choice from a
  retail/domestic tariff (e.g. Ofgem's price cap): ACE sells as a generator,
  not a consumer, so the wholesale price is a much closer (if still
  illustrative) proxy for what this turbine's output might be worth than a
  household electricity bill rate would be. Labelled "not ACE's real income"
  since its actual OVO Energy contract price is still unpublished and may
  differ from the open wholesale market.
- **CO₂ avoided**: last-hour kWh × the GB grid's live carbon intensity
  (gCO₂/kWh), fetched from National Grid ESO's free, public [Carbon
  Intensity API](https://carbonintensity.org.uk/). This ties directly into
  ACE's own published claim of saving "87,600 tonnes of CO2 over its
  lifetime", using a real, live, independently-verifiable public data source.

### "Today's estimated income" (overlay), replacing "today's availability"

The left-hand overlay previously showed "**X**% available today" as its
second stat, alongside lifetime energy and the ALW mission sentence. It now
shows "**£X** est. income today" instead — the same illustrative GB
wholesale-price calculation as the "last hour" ticker (see above), applied
to the exact metered kWh generated since local midnight (Europe/London)
rather than the last 60 minutes. This was a direct swap, not an addition, to
avoid growing the overlay box: a second always-visible stat line next to
"today's income" risked wrapping onto an extra line depending on the figure
size, so one was replaced rather than both being kept.

**Nothing is lost** — daily availability is still live-polled and still
fully available as "Daily availability" in the "Explore more data" panel
below (unaffected; the same `wec_availability` request that always fed it is
untouched), just no longer duplicated in the always-visible overlay.

"Local midnight" is computed correctly across the GMT/BST transition using
the browser's own IANA timezone database (`Intl.DateTimeFormat` with
`timeZone: 'Europe/London'`), not a hard-coded UTC offset — verified against
the live API by checking the actual UTC instant it resolves to on the day
tested (23:00 UTC, i.e. BST midnight) and confirming the API returns a valid
metered reading at that exact instant.

### Live ACE data used by the explainer, specs panel and energy cards

| Data | Endpoint | Refresh | Used for |
|---|---|---|---|
| Wind speed, rotor speed, power | Already-polled `.../data/wec_instantaneous/latest` (no new request) | every 1 second | plain-English headline and explanation |
| Turbine model, serial number, rated power, commissioning date | `.../configuration/latest` (shared with the cache already used to scale the power meter — no duplicate request) | once, when "Turbine specs" is first opened | specs sub-panel |
| Site location name | `.../sites/ace/configuration/latest` | once, when "Turbine specs" is first opened | specs sub-panel |
| Lifetime exported energy, ~60 minutes ago | `.../data/wec_instantaneous/range?resolution=60s&fields=wec_energy_exported` (a single historical point) | every 60 seconds | exact last-hour kWh delta, tower marker, equivalences |
| Lifetime exported energy, at local midnight | `.../data/wec_instantaneous/range?resolution=60s&fields=wec_energy_exported` (a single historical point) | every 15 minutes | exact "today so far" kWh delta, income-today overlay stat |
| GB grid carbon intensity | `api.carbonintensity.org.uk/intensity` (National Grid ESO, not an ACE endpoint) | every 5 minutes | CO₂-avoided ticker item |
| GB wholesale electricity price | `data.elexon.co.uk/bmrs/api/v1/balancing/pricing/market-index` (Elexon, not an ACE endpoint) | every 5 minutes | illustrative £-value ticker item and income-today overlay stat |

Both configuration endpoints are static metadata that essentially never
changes, so they're fetched once, lazily, only the first time a visitor
actually opens the specs panel — not on every refresh and not for visitors
who never open it.

### Offline behaviour

If the live feed goes down, the headline keeps showing the last known state
(consistent with how the rest of the display behaves) and the panel's
border switches to the same red "offline" colour used elsewhere, rather than
guessing or resetting to a blank state. Verified by deliberately blocking the
ACE API during testing.

## A layout note: one flex column, not three separately-positioned boxes

Adding a third right-hand panel was a good opportunity to fix a latent
fragility: in an earlier iteration, the Story Dock and credits box were each
independently `position: absolute` with hard-coded `top`/`bottom` values. That
works until any one box's content changes height — at which point two
independently-positioned boxes can silently start overlapping. Here, the
Story Dock, status explainer, and credits box are instead all
children of one `.right-rail` flex column (`display: flex; flex-direction:
column; gap: ...`), anchored top-to-bottom. Flow layout means they can never
overlap regardless of how long any one panel's content is, with
`overflow-y: auto` as a safety net on unrealistically short screens. Verified
directly via `getBoundingClientRect()` at 1920×1080 with both the Story
Dock's second topic and the full status explainer (including the raw log)
expanded at once — no overlap, no scrollbar needed.

## The 5 Community Pop-up Topics

### 1. 💡 Why is Clean Energy Important? (Global Health & SDGs)
- **Primary link:** [World Health Organization (WHO) — Energy and Health](https://www.who.int/health-topics/energy-and-health#tab=tab_1)
- **Key SDGs:** SDG 7 (Affordable & Clean Energy), SDG 3 (Good Health & Well-being), SDG 1 (No Poverty), SDG 13 (Climate Action)
- **Core message:** Clean energy is not just about kilowatt-hours or utility bills — it is fundamental healthcare.
- **Featured WHO quotation:**
  > "Energy and health are inextricably linked. Access to clean, sustainable and affordable energy, outlined in the seventh Sustainable Development Goal (SDG 7), plays a crucial role in advancing health (SDG 3). Energy is also critical for achieving almost all other global goals that include eradication of poverty (SDG 1), opportunities for quality education (SDG 4), achievement of gender equality (SDG 5), access to clean water (SDG 6), jobs security and economic growth (SDG 8) and combat of climate change (SDG 13).
  >
  > The links between energy and health are particularly evident in homes and health-care facilities. Access to clean and sustainable energy in homes is essential to protect people’s health from household air pollution due to the use of polluting stoves and fuels such as coal and biomass. Access to clean and reliable energy in health-care facilities is important to ensure the delivery of essential health care services for disease prevention and treatment."
- **Local connection:** Connecting the WHO's global insight to Bristol: zero outdoor air pollution from wind generation, warm-home funding via ALW to fight fuel poverty, and dependable power for community health.

### 2. 🏘️ How Does This Help Lawrence Weston? (Community Wealth)
- **Primary link:** [Ambition Lawrence Weston (ALW)](https://www.ambitionlw.org/)
- **Key SDGs:** SDG 1 (No Poverty), SDG 8 (Decent Work & Economic Growth), SDG 11 (Sustainable Communities)
- **Core message:** 100% community-owned — unlike corporate wind farms where profits leave the area, every penny of surplus revenue is reinvested in BS11 to fund emergency fuel support, home insulation grants, youth programmes, and community regeneration.

### 3. 🌬️ How Big Is Our Wind Turbine? (Local Pride & Engineering)
- **Primary link:** [Ambition Community Energy (ACE) — The Turbine](https://ambitioncommunityenergy.org/the-turbine/)
- **Key SDGs:** SDG 7 (Clean Energy), SDG 9 (Industry, Innovation & Infrastructure)
- **Core message:** Standing 150 metres tall to blade tip, the ACE turbine is the tallest onshore wind turbine in England — taller than Bristol Cathedral (65m) and the London Eye (135m). Its 115m rotor diameter sweeps an area wider than a football pitch, generating over 10 million kWh per year.

### 4. ⚡ Where Does the Electricity Actually Go? (The Grid)
- **Primary link:** [Official Live ACE Dashboard](https://ace-api.duckdns.org/dashboard/)
- **Key SDGs:** SDG 7 (Clean Energy), SDG 11 (Sustainable Cities), SDG 12 (Responsible Consumption)
- **Core message:** Tracing the journey of a breeze: mechanical rotation in the nacelle converts to high-voltage electricity, travels down heavy insulated cables inside the 100m steel tower, passes through an on-site transformer, and feeds directly into the local 33kV Western Power Distribution (National Grid) network, powering nearby homes and schools first.

### 5. 🫁 Clean Air and Warm Homes in Bristol (Health & Environment)
- **Primary link:** [ALW Warmth & Energy Advice](https://www.ambitionlw.org/services/energy-advice/)
- **Key SDGs:** SDG 3 (Good Health & Well-being), SDG 7 (Clean Energy), SDG 13 (Climate Action)
- **Core message:** Displacing coal and gas generation prevents toxic nitrogen oxides ($NO_x$) and fine particulate matter ($PM_{2.5}$) from entering local air, while ALW energy advisers help residents solve dampness, insulate drafty homes, and keep heating affordable in winter.

## Right-hand Side Layout Architecture

The display is architected with a balanced, symmetric layout:
- **Turbine Tower as Live Power Gauge:** Rather than an auxiliary vertical bar, the wind turbine tower itself serves as the active generation power gauge, rising from the base to 4,245 kW rated capacity in brand green (`#3ddc84`), with the live numeric kW reading cleanly badged directly beneath the tower foot.
- **Left-hand Overlay:** Anchored to `left: clamp(1rem, 3vw, 2rem)` and `top: clamp(3rem, 6.5vh, 5rem)`, displaying live connection status, wind speed/direction, and cumulative energy.
- **Right-hand rail:** A single flex column anchored to `right: clamp(1rem, 3vw, 2rem)`, spanning from `top: clamp(5.2rem, 10vh, 7rem)` to `bottom: clamp(1.5rem, 3.5vh, 2.75rem)`, containing — in order — the Story Dock, the status explainer, and the credits box. See "A layout note" above for why this is one flex column rather than three independently-positioned boxes.
- **Story modal:** Center-stage overlay with dark frosted backdrop (`backdrop-filter: blur(8px)`), accessible close button (`✕`), keyboard navigation (`Escape`, `Tab`), previous/next topic paging, and indicator dots.

## Live ACE data used by the digital twin, overlay and explorer

| Data | Endpoint | Resolution | Refresh |
|---|---|---|---|
| Core animation fields (power, wind speed, rotor speed, nacelle position, lifetime energy) | `.../data/wec_instantaneous/latest` | 1s | every 1 second |
| 13 additional instantaneous fields (voltage, current, power factor, frequency, etc.) | same request as above | 1s | every 1 second |
| Air pressure, blade pitch | `.../data/wecstd/latest` | 10m | every 60 seconds |
| Daily availability | `.../data/wec_availability/latest` | daily | once at load, then hourly |
| Turbine configuration (rated capacity; also model/serial/commissioning date for the specs panel) | `.../assets/wec-1/configuration/latest` | — | once at load (specs panel reuses this cached response) |
| Site location name (new, for specs panel) | `.../sites/ace/configuration/latest` | — | once, when "Turbine specs" is first opened |
| Signal history chart | `.../data/{family}/range` | 60s / 10m / daily | on demand when selected |

## Checks

Run `node scripts/validate.mjs` from the repository root to validate the
gallery entry. The display itself has no automated test suite; it was
checked live in Chrome at 1920×1080 on 26 October 2026 (live readings
received, right-hand rail measured for overlap, stale and offline states
exercised by blocking the ACE API).
