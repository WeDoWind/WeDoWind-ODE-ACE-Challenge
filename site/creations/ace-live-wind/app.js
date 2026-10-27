import { createAcePoller } from './ace-live.mjs';

// --- Configuration -----------------------------------------------------
const SITE = 'ace';
const ASSET = 'wec-1';
const API_BASE = 'https://ace-api.duckdns.org';

const CORE_FIELDS = ['wec_active_power', 'wec_wind_speed', 'wec_rotor_speed', 'wec_nacelle_position', 'wec_energy_exported'];

const EXTRA_INSTANT_FIELDS = [
  'wec_wind_direction', 'wec_operating_hours', 'wec_power_factor', 'wec_reactive_power',
  'wec_voltage_l1', 'wec_voltage_l2', 'wec_voltage_l3',
  'wec_current_l1', 'wec_current_l2', 'wec_current_l3',
  'wec_frequency', 'wec_available_power_by_wind', 'wec_technically_available_power',
];

const ALL_INSTANT_FIELDS = [...CORE_FIELDS, ...EXTRA_INSTANT_FIELDS];

const LIVE_ENDPOINT =
  `${API_BASE}/v1/sites/${SITE}/assets/${ASSET}/data/wec_instantaneous/latest` +
  `?resolution=1s&fields=${ALL_INSTANT_FIELDS.join(',')}&limit=1`;

const WECSTD_FIELDS = ['air_pressure_mean', 'blade_angle_mean'];
const WECSTD_ENDPOINT =
  `${API_BASE}/v1/sites/${SITE}/assets/${ASSET}/data/wecstd/latest` +
  `?resolution=10m&fields=${WECSTD_FIELDS.join(',')}&limit=1`;

const AVAILABILITY_ENDPOINT =
  `${API_BASE}/v1/sites/${SITE}/assets/${ASSET}/data/wec_availability/latest` +
  `?resolution=daily&fields=availability&limit=1`;

const WEC_CONFIG_ENDPOINT = `${API_BASE}/v1/sites/${SITE}/assets/${ASSET}/configuration/latest`;
const SITE_CONFIG_ENDPOINT = `${API_BASE}/v1/sites/${SITE}/configuration/latest`;

const STALE_AFTER_MS = 15_000;
const WECSTD_STALE_AFTER_MS = 20 * 60 * 1000;

let ratedCapacityKw = 4245;

// --- Cumulative-energy anchors: "last hour" and "today so far" -------------
// wec_energy_exported is a cumulative lifetime meter (kWh), confirmed live
// against the API (values only ever rise). So the exact energy generated in
// any period = (reading now) − (reading at the start of that period), each
// fetched via the documented .../range endpoint — not estimated from average
// power. Used both for the rolling "last hour" and for "today so far".
const HOUR_MS = 60 * 60 * 1000;
const ENERGY_ANCHOR_WINDOW_MS = 90_000; // ±90s search window around a target instant
function buildEnergyAnchorEndpoint(targetMs) {
  const start = new Date(targetMs - ENERGY_ANCHOR_WINDOW_MS).toISOString();
  const end = new Date(targetMs + ENERGY_ANCHOR_WINDOW_MS).toISOString();
  return `${API_BASE}/v1/sites/${SITE}/assets/${ASSET}/data/wec_instantaneous/range` +
    `?resolution=60s&fields=wec_energy_exported&start=${start}&end=${end}&page_size=10`;
}

// Today's start, as a UTC instant — i.e. local midnight in the turbine's own
// timezone (Europe/London), correctly handling the GMT/BST transition via
// the browser's built-in IANA timezone database rather than a hard-coded
// offset. Re-derived from "now" on every call, so it naturally rolls over
// to the new day once this is next refreshed after midnight.
function getTodayStartUtcMs(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(nowMs);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const msSinceLondonMidnight = ((get('hour') % 24 * 60 + get('minute')) * 60 + get('second')) * 1000;
  return nowMs - msSinceLondonMidnight;
}

// Live grid carbon intensity (gCO2/kWh), free/keyless public API from
// National Grid ESO — used to turn the last hour's kWh into an honest "CO2
// avoided" figure without guessing ACE's confidential sale price to OVO
// Energy (that commercial figure isn't published anywhere, so it can't be
// turned into a real "income" stat without fabricating a number).
const CARBON_INTENSITY_ENDPOINT = 'https://api.carbonintensity.org.uk/intensity';

// GB wholesale electricity "Market Index Price" (£/MWh, half-hourly), free/
// keyless public API from Elexon — the official body running Great
// Britain's Balancing Mechanism Reporting Service. This is the actual
// wholesale market reference price generators are settled against, NOT a
// retail/domestic tariff — a much closer (if still illustrative) proxy for
// what this turbine's output might be worth than a household electricity
// price would be, since ACE sells as a generator, not a consumer. ACE's
// actual contracted price with OVO Energy remains confidential and isn't
// published anywhere, so this is clearly labelled as an illustrative market
// reference, not ACE's real income.
const WHOLESALE_PRICE_WINDOW_MS = 3 * 60 * 60 * 1000; // look back 3h to tolerate reporting lag
function buildWholesalePriceEndpoint() {
  const end = new Date();
  const start = new Date(end.getTime() - WHOLESALE_PRICE_WINDOW_MS);
  return 'https://data.elexon.co.uk/bmrs/api/v1/balancing/pricing/market-index' +
    `?from=${start.toISOString()}&to=${end.toISOString()}`;
}

// All factors below are well-established public reference figures (not
// specific to this turbine), used only to make an abstract kWh figure
// relatable — consistent with this concept's policy of not inventing
// unverifiable numbers (see README).
const OFGEM_TYPICAL_HOUSEHOLD_KWH_PER_YEAR = 2700; // Ofgem Typical Domestic Consumption Value (electricity, medium-use profile)
const APPLIANCE_EQUIVALENTS = [
  { icon: '🏠', kwhEach: OFGEM_TYPICAL_HOUSEHOLD_KWH_PER_YEAR / (365 * 24),
    label: (n) => `${compactNumber(n)} UK home${n === 1 ? '' : 's'}' electricity for an hour` },
  { icon: '☕', kwhEach: 0.11, // Energy Saving Trust: ~0.11 kWh to boil a typical full kettle
    label: (n) => `${compactNumber(n)} kettle boil${n === 1 ? '' : 's'}` },
  { icon: '🎮', kwhEach: 0.2, // typical PS5 gameplay draw ~200W
    label: (n) => `${compactNumber(n)} hour${n === 1 ? '' : 's'} of PlayStation gameplay` },
  { icon: '📱', kwhEach: 0.012, // typical smartphone charge ~12 Wh
    label: (n) => `${compactNumber(n)} phone charge${n === 1 ? '' : 's'}` },
  { icon: '💡', kwhEach: 0.01, // typical 9-10W LED bulb
    label: (n) => `${compactNumber(n)} hour${n === 1 ? '' : 's'} of an LED bulb` },
];

// --- Signal catalogue for the "Explore more data" panel -------------------
const SIGNAL_CATALOG = [
  { id: 'wind_speed', group: 'Wind & weather', label: 'Wind speed', unit: 'm/s', decimals: 1,
    source: 'core', fields: ['wec_wind_speed'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'wind_direction', group: 'Wind & weather', label: 'Wind direction', unit: '°', decimals: 0, compass: true,
    source: 'core', fields: ['wec_wind_direction'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'air_pressure', group: 'Wind & weather', label: 'Air pressure', unit: 'mbar', decimals: 0,
    source: 'wecstd', fields: ['air_pressure_mean'], chart: { family: 'wecstd', resolution: '10m', hours: 24 } },

  { id: 'rotor_speed', group: 'Turbine mechanics', label: 'Rotor speed', unit: 'rpm', decimals: 1,
    source: 'core', fields: ['wec_rotor_speed'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'nacelle_position', group: 'Turbine mechanics', label: 'Nacelle position (heading)', unit: '°', decimals: 0, compass: true,
    source: 'core', fields: ['wec_nacelle_position'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'blade_angle', group: 'Turbine mechanics', label: 'Blade (pitch) angle', unit: '°', decimals: 1,
    source: 'wecstd', fields: ['blade_angle_mean'], chart: { family: 'wecstd', resolution: '10m', hours: 24 } },
  { id: 'operating_hours', group: 'Turbine mechanics', label: 'Operating hours (lifetime)', unit: 'h', decimals: 0,
    source: 'core', fields: ['wec_operating_hours'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },

  { id: 'active_power', group: 'Power & electrical', label: 'Active power', unit: 'kW', decimals: 0,
    source: 'core', fields: ['wec_active_power'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'reactive_power', group: 'Power & electrical', label: 'Reactive power', unit: 'kvar', decimals: 0,
    source: 'core', fields: ['wec_reactive_power'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'power_factor', group: 'Power & electrical', label: 'Power factor', unit: '', decimals: 2,
    source: 'core', fields: ['wec_power_factor'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'grid_frequency', group: 'Power & electrical', label: 'Grid frequency', unit: 'Hz', decimals: 2,
    source: 'core', fields: ['wec_frequency'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'grid_voltage', group: 'Power & electrical', label: 'Grid voltage (3-phase)', unit: 'V', decimals: 0, multi: true,
    source: 'core', fields: ['wec_voltage_l1', 'wec_voltage_l2', 'wec_voltage_l3'], seriesLabels: ['L1', 'L2', 'L3'],
    chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'grid_current', group: 'Power & electrical', label: 'Grid current (3-phase)', unit: 'A', decimals: 1, multi: true,
    source: 'core', fields: ['wec_current_l1', 'wec_current_l2', 'wec_current_l3'], seriesLabels: ['L1', 'L2', 'L3'],
    chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },

  { id: 'energy_exported', group: 'Energy & availability', label: 'Lifetime energy exported', unit: 'kWh', decimals: 0,
    source: 'core', fields: ['wec_energy_exported'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'availability_today', group: 'Energy & availability', label: 'Daily availability', unit: '%', decimals: 1,
    source: 'availability', fields: ['availability'], chart: { family: 'wec_availability', resolution: 'daily', hours: 24 * 14 } },
  { id: 'available_power_by_wind', group: 'Energy & availability', label: 'Available power by wind', unit: 'kW', decimals: 0,
    source: 'core', fields: ['wec_available_power_by_wind'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
  { id: 'technically_available_power', group: 'Energy & availability', label: 'Technically available power', unit: 'kW', decimals: 0,
    source: 'core', fields: ['wec_technically_available_power'], chart: { family: 'wec_instantaneous', resolution: '60s', hours: 3 } },
];

// --- Community Stories & Pop-up Content (Option B) ----------------------
const STORIES = [
  {
    id: 'why-clean-energy',
    badge: 'GLOBAL HEALTH & SDGS',
    icon: '💡',
    pill: '💡 Why Clean Energy?',
    title: 'Why is Clean Energy Important?',
    subtitle: 'Energy and health are inextricably linked — from global goals to our homes in Lawrence Weston.',
    teaser: 'Energy and health are inextricably linked. WHO explains how clean power advances health (SDG 3), prevents disease, and beats poverty.',
    sdgs: [
      { code: 'SDG 7', name: 'Affordable & Clean Energy', color: '#ffb612' },
      { code: 'SDG 3', name: 'Good Health & Well-being', color: '#4c9f38' },
      { code: 'SDG 1', name: 'No Poverty', color: '#e5243b' },
      { code: 'SDG 13', name: 'Climate Action', color: '#3f7e44' },
    ],
    quote: {
      text: [
        'Energy and health are inextricably linked. Access to clean, sustainable and affordable energy, outlined in the seventh Sustainable Development Goal (SDG 7), plays a crucial role in advancing health (SDG 3). Energy is also critical for achieving almost all other global goals that include eradication of poverty (SDG 1), opportunities for quality education (SDG 4), achievement of gender equality (SDG 5), access to clean water (SDG 6), jobs security and economic growth (SDG 8) and combat of climate change (SDG 13).',
        'The links between energy and health are particularly evident in homes and health-care facilities. Access to clean and sustainable energy in homes is essential to protect people’s health from household air pollution due to the use of polluting stoves and fuels such as coal and biomass. Access to clean and reliable energy in health-care facilities is important to ensure the delivery of essential health care services for disease prevention and treatment.',
      ],
      source: 'World Health Organization (WHO) — Energy & Health',
    },
    bodyHtml: `
      <h4 class="modal-section-title">🌍 Clean Energy is Healthcare</h4>
      <p>When people think of renewable energy, they often focus on kilowatt-hours or electricity bills. But as the <strong>World Health Organization (WHO)</strong> explains, clean energy is fundamentally an investment in <em>human health, clean air, and life expectancy</em>.</p>
      
      <h4 class="modal-section-title">🏥 How Clean Wind Directly Protects Health:</h4>
      <ul class="modal-list">
        <li><strong>Zero Outdoor Air Pollution:</strong> Generating electricity with our 4.2 MW wind turbine produces zero toxic emissions. Every megawatt-hour generated displaces gas and coal burning, preventing harmful nitrogen oxides (NO<sub>x</sub>) and fine particulates (PM<sub>2.5</sub>) that trigger asthma, heart attacks, and respiratory diseases in Bristol.</li>
        <li><strong>Warmer, Drier Homes:</strong> In the UK, cold and damp housing is a major public health hazard. Through Ambition Community Energy (ACE), profits from this turbine fund Ambition Lawrence Weston's Energy Advice service, helping residents insulate their homes, fix dampness, and stay warm in winter.</li>
        <li><strong>Reliable Health & Community Services:</strong> From powering medical clinics and vaccine refrigeration to keeping community centres lit and heated, affordable clean energy provides the foundation for essential social services.</li>
      </ul>
      <p>By generating clean electricity right here in Lawrence Weston, our community is actively turning global UN goals into local, tangible benefits.</p>
    `,
    links: [
      { label: 'Read WHO: Energy and Health ↗', url: 'https://www.who.int/health-topics/energy-and-health#tab=tab_1', primary: true },
      { label: 'Visit Ambition Community Energy ↗', url: 'https://ambitioncommunityenergy.org/' },
      { label: 'Visit Ambition Lawrence Weston ↗', url: 'https://www.ambitionlw.org/' },
    ],
  },
  {
    id: 'community-wealth',
    badge: 'COMMUNITY WEALTH BUILDING',
    icon: '🏘️',
    pill: '🏘️ Local Impact',
    title: 'How Does This Help Lawrence Weston?',
    subtitle: '100% community-owned — every pound of surplus revenue stays right here in BS11.',
    teaser: 'Unlike corporate wind farms, 100% of profits stay in Lawrence Weston to fight fuel poverty, fund warm home advice, and support local youth.',
    sdgs: [
      { code: 'SDG 1', name: 'No Poverty', color: '#e5243b' },
      { code: 'SDG 8', name: 'Decent Work & Economic Growth', color: '#a21942' },
      { code: 'SDG 11', name: 'Sustainable Communities', color: '#fd9d24' },
    ],
    bodyHtml: `
      <h4 class="modal-section-title">💡 A Different Kind of Energy Project</h4>
      <p>Across the UK, most wind farms are built and owned by multinational corporations or distant private equity funds. The electricity is generated locally, but the financial returns flow away to external shareholders.</p>
      <p>The <strong>Ambition Community Energy (ACE)</strong> turbine is fundamentally different. It was conceived, planned, and delivered by the residents of Lawrence Weston through their local charity, <strong>Ambition Lawrence Weston (ALW)</strong>.</p>
      
      <h4 class="modal-section-title">💰 Where the Turbine Revenue Goes:</h4>
      <ul class="modal-list">
        <li><strong>Tackling Fuel Poverty:</strong> Lawrence Weston faces some of the highest fuel poverty rates in Bristol. Surplus turbine income funds ALW's Energy Advice Team, helping vulnerable families lower bills, access grants, and fix heating systems.</li>
        <li><strong>Local Community Hub:</strong> Supporting the Lawrence Weston Community Centre, which provides meals, advice, warm spaces, and community events for all ages.</li>
        <li><strong>Youth Programmes & Green Jobs:</strong> Funding local youth activities and introducing young people to high-value skills in renewable energy and engineering.</li>
      </ul>
      <p>It is proof that clean energy can build community wealth and directly lift families out of hardship.</p>
    `,
    links: [
      { label: 'Visit Ambition Lawrence Weston ↗', url: 'https://www.ambitionlw.org/', primary: true },
      { label: 'How ACE Was Built ↗', url: 'https://ambitioncommunityenergy.org/about-ace/' },
    ],
  },
  {
    id: 'turbine-scale',
    badge: 'LOCAL PRIDE & ENGINEERING',
    icon: '🌬️',
    pill: '🌬️ 150m Giant',
    title: 'How Big Is Our Wind Turbine?',
    subtitle: 'Standing 150 metres tall — England’s largest onshore wind turbine.',
    teaser: 'At 150m to blade tip, our turbine is taller than Bristol Cathedral (65m) and the London Eye (135m), generating 4.2 MW at capacity.',
    sdgs: [
      { code: 'SDG 7', name: 'Affordable & Clean Energy', color: '#ffb612' },
      { code: 'SDG 9', name: 'Industry & Innovation', color: '#f36e25' },
    ],
    bodyHtml: `
      <h4 class="modal-section-title">🏗️ Record-Breaking Scale in BS11</h4>
      <p>Our turbine is not just a community project — it is a genuine engineering feat. Standing <strong>150 metres (492 feet) tall</strong> to blade tip, it is the tallest onshore wind turbine in England.</p>
      
      <h4 class="modal-section-title">📐 Key Dimensions & Power:</h4>
      <ul class="modal-list">
        <li><strong>Height Comparison:</strong> Taller than Bristol Cathedral (65m), Clifton Suspension Bridge towers (75m), and even the London Eye (135m)!</li>
        <li><strong>Rotor Diameter:</strong> 115 metres across — sweeping an area larger than an entire football pitch with every rotation.</li>
        <li><strong>Rated Capacity:</strong> 4,245 kW (4.2 MW) — capable of generating over 10 million kilowatt-hours (kWh) of clean electricity every year.</li>
        <li><strong>Household Equivalent:</strong> Generates enough electricity each year to cover the equivalent demand of approximately 3,000 to 3,800 average UK homes.</li>
      </ul>
    `,
    links: [
      { label: 'Turbine Technical Specifications ↗', url: 'https://ambitioncommunityenergy.org/the-turbine/', primary: true },
      { label: 'Zenodo Open Dataset & Citation ↗', url: 'https://doi.org/10.5281/zenodo.22662372' },
    ],
  },
  {
    id: 'grid-connection',
    badge: 'THE ELECTRICAL GRID',
    icon: '⚡',
    pill: '⚡ The Grid',
    title: 'Where Does the Electricity Actually Go?',
    subtitle: 'From wind to wires — feeding directly into the local Bristol electricity network.',
    teaser: 'Clean power generated right above Lawrence Weston feeds into the 33,000-volt local grid, powering nearby homes, schools and shops first.',
    sdgs: [
      { code: 'SDG 7', name: 'Affordable & Clean Energy', color: '#ffb612' },
      { code: 'SDG 11', name: 'Sustainable Cities', color: '#fd9d24' },
      { code: 'SDG 12', name: 'Responsible Consumption', color: '#bf8b2e' },
    ],
    bodyHtml: `
      <h4 class="modal-section-title">🔌 Journey of a Breeze</h4>
      <p>Have you ever wondered what happens after the wind strikes the turbine blades? Here is how mechanical motion becomes the electricity powering a kettle or television in Lawrence Weston:</p>
      
      <ul class="modal-list">
        <li><strong>1. Capturing the Wind:</strong> Aerodynamic lift on the three 56-metre blades causes the rotor hub to turn between 6 and 14 revolutions per minute.</li>
        <li><strong>2. Generating High-Voltage AC:</strong> Inside the nacelle at the top of the tower, the generator converts this rotation into alternating current (AC) electricity.</li>
        <li><strong>3. Down the Tower:</strong> Massive insulated copper cables carry the electricity down inside the hollow 100-metre steel tower to a transformer at the base.</li>
        <li><strong>4. Feeding the Local Grid:</strong> Stepped up to 33,000 volts (33 kV), the clean electricity flows directly into the local Western Power Distribution (National Grid) network, supplying local homes and businesses before travelling further afield.</li>
      </ul>
    `,
    links: [
      { label: 'Official Live ACE Dashboard ↗', url: 'https://ace-api.duckdns.org/dashboard/', primary: true },
      { label: 'How the UK Grid Works ↗', url: 'https://www.nationalgrid.com/stories/energy-explained' },
    ],
  },
  {
    id: 'clean-air',
    badge: 'HEALTH & ENVIRONMENT',
    icon: '🫁',
    pill: '🫁 Clean Air & Health',
    title: 'Clean Air and Warm Homes in Bristol',
    subtitle: 'Cutting air pollution, protecting respiratory health, and beating cold, damp homes.',
    teaser: 'Displacing coal and gas reduces toxic particulate pollution (PM2.5) in Bristol, while ALW energy advice helps keep homes warm and dry.',
    sdgs: [
      { code: 'SDG 3', name: 'Good Health & Well-being', color: '#4c9f38' },
      { code: 'SDG 7', name: 'Affordable & Clean Energy', color: '#ffb612' },
      { code: 'SDG 13', name: 'Climate Action', color: '#3f7e44' },
    ],
    bodyHtml: `
      <h4 class="modal-section-title">💨 Breathing Cleaner Air in BS11</h4>
      <p>Lawrence Weston and Avonmouth sit adjacent to heavy motorway traffic and port industry. Clean air is a matter of everyday well-being for our children and older residents.</p>
      <p>Every megawatt-hour of wind energy produced replaces electricity that would otherwise come from burning fossil fuels. This stops thousands of tonnes of carbon dioxide, sulfur dioxide, and fine particulate matter (PM2.5) from being released into our regional atmosphere.</p>
      
      <h4 class="modal-section-title">🏡 Protecting Health Indoors</h4>
      <p>The World Health Organization identifies cold, damp housing as a primary trigger for childhood asthma, bronchitis, and cardiovascular illness. By directing revenue to local energy advisers, ACE and ALW help residents:</p>
      <ul class="modal-list">
        <li>Access emergency winter warmth fuel vouchers.</li>
        <li>Insulate attics, cavity walls, and drafty windows.</li>
        <li>Resolve indoor damp and mould issues safely.</li>
        <li>Switch to fairer tariffs and eliminate predatory utility debt.</li>
      </ul>
    `,
    links: [
      { label: 'Get Warmth & Energy Advice at ALW ↗', url: 'https://www.ambitionlw.org/services/energy-advice/', primary: true },
      { label: 'WHO Household Air Pollution Facts ↗', url: 'https://www.who.int/news-room/fact-sheets/detail/household-air-pollution-and-health' },
    ],
  },
];

// --- DOM references -----------------------------------------------------
const sceneEl = document.getElementById('scene');
const skyEl = document.getElementById('sky');
const windLayerEl = document.getElementById('wind-layer');
const freshnessEl = document.getElementById('freshness');
const powerValueEl = document.getElementById('power-value');
const windValueEl = document.getElementById('wind-value');
const observedEl = document.getElementById('observed-value');
const ratedCapacityEl = document.getElementById('rated-capacity');
const meterFillEl = document.getElementById('meter-fill');
const headingValueEl = document.getElementById('heading-value');
const rotorGroupEl = document.getElementById('rotor');
const yawGroupEl = document.getElementById('yaw-group');
const fallbackMessageEl = document.getElementById('fallback-message');
const lifetimeEnergyEl = document.getElementById('lifetime-energy');
const incomeTodayEl = document.getElementById('income-today');

const explorerToggleEl = document.getElementById('explorer-toggle');
const explorerPanelEl = document.getElementById('explorer-panel');
const signalSelectEl = document.getElementById('signal-select');
const signalValueEl = document.getElementById('signal-value');
const signalUnitEl = document.getElementById('signal-unit');
const signalFreshnessEl = document.getElementById('signal-freshness');
const signalChartEl = document.getElementById('signal-chart');
const chartStatusEl = document.getElementById('chart-status');
const signalLegendEl = document.getElementById('signal-legend');

// Story Dock & Modal DOM references
const storyDockEl = document.getElementById('story-dock');
const storyCounterEl = document.getElementById('story-dock-counter');
const teaserTitleEl = document.getElementById('teaser-title');
const teaserSnippetEl = document.getElementById('teaser-snippet');
const teaserReadBtnEl = document.getElementById('teaser-read-btn');
const storyPillsContainerEl = document.querySelector('.story-pills');

const modalBackdropEl = document.getElementById('story-modal-backdrop');
const modalCloseBtnEl = document.getElementById('modal-close');
const modalTagEl = document.getElementById('modal-tag');
const modalIconEl = document.getElementById('modal-icon');
const modalTitleEl = document.getElementById('modal-title');
const modalSubtitleEl = document.getElementById('modal-subtitle');
const modalSdgsEl = document.getElementById('modal-sdgs');
const modalBodyEl = document.getElementById('modal-body');
const modalLinksEl = document.getElementById('modal-links');
const modalPrevBtnEl = document.getElementById('modal-prev-btn');
const modalNextBtnEl = document.getElementById('modal-next-btn');
const modalDotsEl = document.getElementById('modal-dots');

// "What's it doing right now?" status explainer DOM references
const statusDockEl = document.getElementById('status-dock');
const statusDockToggleEl = document.getElementById('status-dock-toggle');
const statusDockBodyEl = document.getElementById('status-dock-body');
const statusDockIconEl = document.getElementById('status-dock-icon');
const statusDockHeadlineEl = document.getElementById('status-dock-headline');
const statusDockExplainEl = document.getElementById('status-dock-explain');
const statusDockSpecsToggleEl = document.getElementById('status-dock-specs-toggle');
const statusDockSpecsEl = document.getElementById('status-dock-specs');
const specModelEl = document.getElementById('spec-model');
const specSerialEl = document.getElementById('spec-serial');
const specPowerEl = document.getElementById('spec-power');
const specCommissionedEl = document.getElementById('spec-commissioned');
const specLocationEl = document.getElementById('spec-location');

// "Last hour" energy card & tower overlay DOM references
const hourAvgFillEl = document.getElementById('hour-avg-fill');
const hourAvgMarkerLineEl = document.getElementById('hour-avg-marker-line');
const hourAvgMarkerArrowEl = document.getElementById('hour-avg-marker-arrow');
const hourEnergyValueEl = document.getElementById('hour-energy-value');
const hourTickerTextEl = document.getElementById('hour-ticker-text');

// --- State ---------------------------------------------------------------
let lastGoodObservedAtMs = null;
let unavailable = false;
let wecstdUnavailable = false;

const coreCache = {};
const wecstdCache = {};
let availabilityValue = null;
let availabilityObservedAtMs = null;

// "Last hour" energy state
let hourAgoEnergyKwh = null;
let carbonIntensityGPerKwh = null;
let wholesalePricePencePerKwh = null;
let currentHourMessages = ['Waiting for an hour of live data…'];
let hourMessageIndex = 0;

// "Today so far" income estimate state (overlay info panel)
let todayStartEnergyKwh = null;

let selectedSignalId = SIGNAL_CATALOG[0].id;
let chartAbortController = null;
let chartRequestToken = 0;

// Story Dock & Modal state
let currentStoryIndex = 0;
let storyCycleTimer = null;
let isUserHoveringDock = false;
let isModalOpen = false;

// Status explainer state
let wecConfigChangesCache = null;

const numberFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const oneDecimalFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const compactFormatter = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });

// Appliance-equivalence counts can run into the tens of thousands (e.g. LED
// bulb-hours); compact notation (e.g. "12K") keeps the "last hour" ticker
// readable on a public kiosk display instead of overflowing its card.
function compactNumber(value) {
  return value >= 10_000 ? compactFormatter.format(value) : numberFormatter.format(value);
}

function compassLabel(deg) {
  if (!Number.isFinite(deg)) return '--';
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalised = ((deg % 360) + 360) % 360;
  const index = Math.round(normalised / 22.5) % 16;
  return points[index];
}

function isGoodQuality(quality) {
  return typeof quality === 'string' && quality.toLowerCase() === 'good';
}

const decimalFormatters = new Map();
function formatNumber(value, decimals) {
  if (!decimalFormatters.has(decimals)) {
    decimalFormatters.set(decimals, new Intl.NumberFormat('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  }
  return decimalFormatters.get(decimals).format(value);
}

function findSignal(id) {
  return SIGNAL_CATALOG.find((s) => s.id === id);
}

// --- Decorative wind streaks ---
const STREAK_COUNT = 7;
const streaks = [];
for (let i = 0; i < STREAK_COUNT; i += 1) {
  const streak = document.createElement('div');
  streak.className = 'streak';
  streak.style.top = `${8 + i * 9 + (i % 2 === 0 ? 2 : -2)}%`;
  streak.style.animationDelay = `${i * -1.3}s`;
  windLayerEl.appendChild(streak);
  streaks.push(streak);
}

function updateWindVisual(windSpeedMs) {
  const clamped = Math.max(0, Math.min(25, windSpeedMs));
  const duration = Math.max(2.5, 14 - clamped * 0.5);
  const opacity = Math.min(1, 0.25 + clamped / 18);
  streaks.forEach((streak) => {
    streak.style.animationDuration = `${duration}s`;
    streak.style.opacity = clamped < 0.5 ? 0 : String(opacity);
  });
}

// --- Decorative diurnal sky ---
function updateSky() {
  const hour = new Date().getHours();
  let top, bottom;
  if (hour < 6 || hour >= 21) {
    top = '#060e21';
    bottom = '#132743';
  } else if (hour < 9) {
    top = '#2b4f81';
    bottom = '#f3b98a';
  } else if (hour < 18) {
    top = '#2b6cb0';
    bottom = '#bcdffb';
  } else {
    top = '#2a3a63';
    bottom = '#e58a6b';
  }
  skyEl.style.setProperty('--sky-a', top);
  skyEl.style.setProperty('--sky-b', bottom);
}
updateSky();
setInterval(updateSky, 60_000);

// --- Rotor animation ---
const ROTOR_PIVOT = '800 393';
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let currentRpm = 0;
let bladeAngleDeg = 0;
let lastFrameTimeMs = null;

function animateRotor(timestampMs) {
  if (lastFrameTimeMs !== null && !prefersReducedMotion && currentRpm > 0.5) {
    const deltaSeconds = (timestampMs - lastFrameTimeMs) / 1000;
    bladeAngleDeg = (bladeAngleDeg + (currentRpm / 60) * 360 * deltaSeconds) % 360;
    rotorGroupEl.setAttribute('transform', `rotate(${bladeAngleDeg.toFixed(2)} ${ROTOR_PIVOT})`);
  }
  lastFrameTimeMs = timestampMs;
  requestAnimationFrame(animateRotor);
}
requestAnimationFrame(animateRotor);

// --- "What's it doing right now?" status explainer ------------------------
// Built entirely from signals we already trust and display elsewhere (wind
// speed, rotor speed, power) rather than the turbine controller's raw
// main_status/substatus codes, which ACE's API does not publicly document —
// see /v1/event-families and the status-explainer section of this concept's
// README for why those raw codes are shown separately, unmodified, with a
// clear "no official decoder" disclaimer instead of being interpreted here.
const STATUS_DOCK_ICONS = { generating: '🌀', calm: '🍃', highwind: '⚠️', idle: '⏸️' };

// Thresholds below are general wind-industry ballpark figures used only to
// pick a plain-English explanation, not an assertion about this specific
// turbine's certified cut-in/cut-out specification.
const LIGHT_WIND_MS = 3.5;
const STRONG_WIND_MS = 20;
const SPINNING_RPM = 1;

function describeTurbineState(power, wind, rotorRpm) {
  const windText = `${oneDecimalFormatter.format(wind)} m/s`;

  if (rotorRpm >= SPINNING_RPM && power > 5) {
    return {
      state: 'generating',
      headline: 'Generating electricity',
      explain:
        `The blades are turning at about ${oneDecimalFormatter.format(rotorRpm)} rpm in a ${windText} wind, ` +
        `producing ${numberFormatter.format(power)} kW right now — the turbine doing its normal job.`,
    };
  }
  if (wind < LIGHT_WIND_MS) {
    return {
      state: 'calm',
      headline: 'Resting — not enough wind',
      explain:
        `Wind turbines only start generating once the wind is strong enough to turn the heavy blades. ` +
        `Right now the wind here is ${windText}, which is too light, so the turbine is simply waiting for ` +
        `more wind. This is completely normal.`,
    };
  }
  if (wind > STRONG_WIND_MS) {
    return {
      state: 'highwind',
      headline: 'Paused — strong-wind safety stop',
      explain:
        `In very strong winds (currently ${windText}), turbines are designed to stop turning automatically ` +
        `to protect themselves. This is a normal safety feature, not a fault — it should start again once ` +
        `winds ease.`,
    };
  }
  return {
    state: 'idle',
    headline: 'Not generating right now',
    explain:
      `The turbine isn't producing power at this exact moment, even though there's a moderate ${windText} ` +
      `breeze. This can happen during a brief technical pause, a scheduled maintenance check, or a routine ` +
      `restart — a normal part of safely operating a large wind turbine.`,
  };
}

function updateStatusDockReading(power, wind, rotorRpm) {
  const { state, headline, explain } = describeTurbineState(power, wind, rotorRpm);
  statusDockIconEl.textContent = STATUS_DOCK_ICONS[state];
  statusDockHeadlineEl.textContent = headline;
  statusDockExplainEl.textContent = explain;
  statusDockEl.classList.toggle('is-generating', state === 'generating');
}

function updateStatusDockOfflineVisual(isOffline) {
  statusDockEl.classList.toggle('is-offline', isOffline);
  if (isOffline && statusDockHeadlineEl.textContent === "Checking…") {
    statusDockHeadlineEl.textContent = "Can't check right now";
    statusDockExplainEl.textContent =
      'We lost contact with the live ACE feed, so we can’t tell what the turbine is doing at this exact ' +
      'moment. This will update again automatically once the connection returns.';
  }
}

// --- "Last hour" / "today" energy: exact metered deltas, equivalences, CO2, income --
function findClosestEnergyValue(data, targetMs) {
  const values = data.series?.wec_energy_exported || [];
  const timestamps = data.timestamps || [];
  if (!values.length) return null;
  let bestIndex = 0;
  let bestDiffMs = Infinity;
  timestamps.forEach((tsMicros, index) => {
    const diffMs = Math.abs(tsMicros / 1000 - targetMs);
    if (diffMs < bestDiffMs) {
      bestDiffMs = diffMs;
      bestIndex = index;
    }
  });
  return Number.isFinite(values[bestIndex]) ? values[bestIndex] : null;
}

function computeLastHourKwh() {
  const current = coreCache.wec_energy_exported;
  if (!current?.good || !Number.isFinite(hourAgoEnergyKwh)) return null;
  const delta = current.value - hourAgoEnergyKwh;
  return delta >= 0 ? delta : null;
}

function computeTodayKwh() {
  const current = coreCache.wec_energy_exported;
  if (!current?.good || !Number.isFinite(todayStartEnergyKwh)) return null;
  const delta = current.value - todayStartEnergyKwh;
  return delta >= 0 ? delta : null;
}

function buildHourMessages(lastHourKwh) {
  if (!Number.isFinite(lastHourKwh) || lastHourKwh <= 0) {
    return ['Waiting for an hour of live data…'];
  }
  const messages = APPLIANCE_EQUIVALENTS.map(({ icon, kwhEach, label }) => {
    const count = Math.max(1, Math.round(lastHourKwh / kwhEach));
    return `${icon} ${label(count)}`;
  });
  if (Number.isFinite(wholesalePricePencePerKwh)) {
    const poundsValue = (lastHourKwh * wholesalePricePencePerKwh) / 100;
    messages.push(`💷 ≈ £${numberFormatter.format(poundsValue)} at today's GB wholesale price (not ACE's real income)`);
  }
  if (Number.isFinite(carbonIntensityGPerKwh)) {
    const kgCo2 = (lastHourKwh * carbonIntensityGPerKwh) / 1000;
    messages.push(`🌍 ≈ ${numberFormatter.format(kgCo2)} kg CO₂ avoided vs the UK grid average right now`);
  }
  return messages;
}

function renderHourMessage() {
  if (!currentHourMessages.length) return;
  hourTickerTextEl.textContent = currentHourMessages[hourMessageIndex % currentHourMessages.length];
}

setInterval(() => {
  hourMessageIndex += 1;
  renderHourMessage();
}, 6_000);

function updateHourPanel() {
  const lastHourKwh = computeLastHourKwh();

  if (Number.isFinite(lastHourKwh)) {
    hourEnergyValueEl.textContent = numberFormatter.format(lastHourKwh);
    // kWh generated over exactly one hour is numerically the same as an
    // average kW over that hour, so it shares the tower's 0–4.2 MW kW scale.
    const hourAvgFraction = Math.max(0, Math.min(1, lastHourKwh / ratedCapacityKw));
    const hourAvgY = 843 - hourAvgFraction * 450;
    hourAvgFillEl.setAttribute('y', hourAvgY.toFixed(1));
    hourAvgFillEl.setAttribute('height', (hourAvgFraction * 450).toFixed(1));
    hourAvgMarkerLineEl.setAttribute('y1', hourAvgY.toFixed(1));
    hourAvgMarkerLineEl.setAttribute('y2', hourAvgY.toFixed(1));
    hourAvgMarkerArrowEl.setAttribute(
      'points',
      `815,${hourAvgY.toFixed(1)} 823,${(hourAvgY - 4).toFixed(1)} 823,${(hourAvgY + 4).toFixed(1)}`,
    );
  } else {
    hourEnergyValueEl.textContent = '--';
  }

  currentHourMessages = buildHourMessages(lastHourKwh);
  renderHourMessage();
}

function updateTodayIncomePanel() {
  const todayKwh = computeTodayKwh();
  if (Number.isFinite(todayKwh) && Number.isFinite(wholesalePricePencePerKwh)) {
    const poundsValue = (todayKwh * wholesalePricePencePerKwh) / 100;
    incomeTodayEl.textContent = numberFormatter.format(poundsValue);
  } else {
    incomeTodayEl.textContent = '--';
  }
}

async function refreshHourAgoEnergyAnchor() {
  const targetMs = Date.now() - HOUR_MS;
  try {
    const response = await fetch(buildEnergyAnchorEndpoint(targetMs));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const value = findClosestEnergyValue(data, targetMs);
    if (value === null) throw new Error('No data points returned in the last-hour anchor window');
    hourAgoEnergyKwh = value;
  } catch (error) {
    console.warn('Could not refresh last-hour energy anchor; keeping previous value:', error);
  }
}

async function refreshTodayStartEnergyAnchor() {
  const targetMs = getTodayStartUtcMs();
  try {
    const response = await fetch(buildEnergyAnchorEndpoint(targetMs));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const value = findClosestEnergyValue(data, targetMs);
    if (value === null) throw new Error('No data points returned in the start-of-day anchor window');
    todayStartEnergyKwh = value;
  } catch (error) {
    console.warn('Could not refresh start-of-day energy anchor; keeping previous value:', error);
  }
}

async function refreshCarbonIntensity() {
  try {
    const response = await fetch(CARBON_INTENSITY_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const intensity = data.data?.[0]?.intensity;
    const value = intensity?.actual ?? intensity?.forecast;
    if (Number.isFinite(value)) {
      carbonIntensityGPerKwh = value;
    }
  } catch (error) {
    console.warn('Could not refresh live grid carbon intensity (National Grid ESO); keeping previous value:', error);
  }
}

async function refreshWholesalePrice() {
  try {
    const response = await fetch(buildWholesalePriceEndpoint());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rows = data.data || [];
    // Rows alternate between two power exchanges (APXMIDP, N2EXMIDP) per
    // half-hour, newest first; use the most recent one that actually had
    // trading volume (a provider can report a zero/no-trade period).
    const latest =
      rows.find((row) => row.dataProvider === 'APXMIDP' && Number.isFinite(row.price) && row.volume > 0) ||
      rows.find((row) => Number.isFinite(row.price) && row.volume > 0);
    if (latest) {
      // £/MWh -> pence/kWh: (£/MWh ÷ 1000 kWh per MWh) x 100 pence per £ = £/MWh ÷ 10.
      wholesalePricePencePerKwh = latest.price / 10;
    }
  } catch (error) {
    console.warn('Could not refresh live GB wholesale electricity price (Elexon); keeping previous value:', error);
  }
}

async function loadTurbineSpecsOnce() {
  try {
    const [wecResponse, siteResponse] = await Promise.all([
      wecConfigChangesCache ? Promise.resolve(null) : fetch(WEC_CONFIG_ENDPOINT),
      fetch(SITE_CONFIG_ENDPOINT),
    ]);

    let changes = wecConfigChangesCache;
    if (wecResponse) {
      if (!wecResponse.ok) throw new Error(`HTTP ${wecResponse.status}`);
      const wecData = await wecResponse.json();
      changes = wecData.changes || [];
      wecConfigChangesCache = changes;
    }

    const findValue = (list, signal) => list?.find((c) => c.signal === signal)?.value;
    const model = findValue(changes, 'wec_type');
    const serial = findValue(changes, 'wec_serial_number');
    const nominalPower = findValue(changes, 'wec_nominal_power');
    const availabilityStart = findValue(changes, 'wec_availability_start');

    specModelEl.textContent = model || '--';
    specSerialEl.textContent = serial || '--';
    specPowerEl.textContent = Number.isFinite(nominalPower)
      ? `${numberFormatter.format(nominalPower)} kW`
      : '--';
    specCommissionedEl.textContent = availabilityStart
      ? new Date(availabilityStart).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Europe/London',
        })
      : '--';

    if (!siteResponse.ok) throw new Error(`HTTP ${siteResponse.status}`);
    const siteData = await siteResponse.json();
    const locationName = findValue(siteData.changes, 'location_name');
    specLocationEl.textContent = locationName || '--';
  } catch (error) {
    console.warn('Could not load turbine specs:', error);
  }
}

// --- Freshness (core animation) ---
function showFreshness() {
  let state, label;
  if (unavailable && lastGoodObservedAtMs === null) {
    state = 'offline';
    label = 'Unavailable — waiting for first reading';
  } else if (unavailable) {
    state = 'offline';
    label = 'Offline — showing last known reading';
  } else if (lastGoodObservedAtMs === null) {
    state = 'stale';
    label = 'Connecting…';
  } else if (Date.now() - lastGoodObservedAtMs > STALE_AFTER_MS) {
    state = 'stale';
    label = 'Stale reading';
  } else {
    state = 'good';
    label = 'Live';
  }
  freshnessEl.textContent = label;
  freshnessEl.className = `freshness ${state}`;
  sceneEl.classList.toggle('offline', state === 'offline');
  fallbackMessageEl.hidden = state !== 'offline';
  if (state === 'offline') currentRpm = 0;
  updateStatusDockOfflineVisual(state === 'offline');
}

function handleLiveData(data) {
  const series = data.series || {};
  const quality = data.series_quality || {};
  const observedAt = data.series_observed_at || {};

  ALL_INSTANT_FIELDS.forEach((field) => {
    const value = series[field]?.[0];
    const observed = observedAt[field]?.[0];
    const good =
      Number.isFinite(value) &&
      isGoodQuality(quality[field]?.[0]) &&
      Number.isFinite(observed) &&
      Number.isFinite(new Date(observed / 1000).getTime()) &&
      observed / 1000 <= Date.now() + 60_000;
    coreCache[field] = good ? { value, observedAtMs: observed / 1000, good: true } : { ...(coreCache[field] || {}), good: false };
  });

  const requiredOk = CORE_FIELDS.every((field) => coreCache[field]?.good);
  if (!requiredOk) {
    throw new Error('Missing or invalid signal in wec_instantaneous response');
  }

  const power = coreCache.wec_active_power.value;
  const wind = coreCache.wec_wind_speed.value;
  const rotorRpm = coreCache.wec_rotor_speed.value;
  const heading = coreCache.wec_nacelle_position.value;
  const lifetimeEnergy = coreCache.wec_energy_exported.value;
  const lifetimeEnergyMwh = Math.round(lifetimeEnergy / 1000);

  const oldestObservedMicros = Math.min(...CORE_FIELDS.map((f) => observedAt[f][0]));
  lastGoodObservedAtMs = oldestObservedMicros / 1000;

  powerValueEl.textContent = numberFormatter.format(power);
  windValueEl.textContent = oneDecimalFormatter.format(wind);
  observedEl.textContent = new Date(lastGoodObservedAtMs).toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
  });
  lifetimeEnergyEl.textContent = numberFormatter.format(lifetimeEnergyMwh);

  const yawOffsetPx = ((heading - 180) / 180) * 8;
  yawGroupEl.setAttribute('transform', `translate(${yawOffsetPx.toFixed(1)}, 0)`);

  const fraction = Math.max(0, Math.min(1, power / ratedCapacityKw));
  const fillHeight = fraction * 450;
  meterFillEl.setAttribute('y', (843 - fillHeight).toFixed(1));
  meterFillEl.setAttribute('height', fillHeight.toFixed(1));

  headingValueEl.textContent = `${compassLabel(heading)} (${Math.round(heading)}°)`;
  updateWindVisual(wind);
  currentRpm = rotorRpm;
  updateStatusDockReading(power, wind, rotorRpm);
  updateHourPanel();
  updateTodayIncomePanel();

  unavailable = false;
  showFreshness();
  refreshExplorerLiveValue();
}

function handleLiveError() {
  unavailable = true;
  showFreshness();
  refreshExplorerLiveValue();
}


const poller = createAcePoller({
  endpoint: LIVE_ENDPOINT,
  onData: handleLiveData,
  onError: handleLiveError,
  intervalMs: 1000,
});

function handleWecstdData(data) {
  const series = data.series || {};
  const perFieldQuality = data.series_quality || {};
  const perFieldObservedAt = data.series_observed_at || {};
  const sharedQuality = data.quality?.[0];
  const sharedObservedAt = data.timestamps?.[0];
  WECSTD_FIELDS.forEach((field) => {
    const value = series[field]?.[0];
    const quality = perFieldQuality[field]?.[0] ?? sharedQuality;
    const observed = perFieldObservedAt[field]?.[0] ?? sharedObservedAt;
    const good =
      Number.isFinite(value) &&
      isGoodQuality(quality) &&
      Number.isFinite(observed) &&
      Number.isFinite(new Date(observed / 1000).getTime());
    wecstdCache[field] = good ? { value, observedAtMs: observed / 1000, good: true } : { ...(wecstdCache[field] || {}), good: false };
  });
  wecstdUnavailable = false;
  refreshExplorerLiveValue();
}

function handleWecstdError() {
  wecstdUnavailable = true;
  refreshExplorerLiveValue();
}

const wecstdPoller = createAcePoller({
  endpoint: WECSTD_ENDPOINT,
  onData: handleWecstdData,
  onError: handleWecstdError,
  intervalMs: 60_000,
});

setInterval(showFreshness, 1000);
setInterval(refreshExplorerLiveValue, 1000);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    poller.stop();
    wecstdPoller.stop();
  } else {
    poller.start();
    wecstdPoller.start();
  }
});

if (!document.hidden) {
  poller.start();
  wecstdPoller.start();
}

// --- One-off fetch: rated capacity & availability ---
async function loadStaticConfiguration() {
  try {
    const response = await fetch(WEC_CONFIG_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    wecConfigChangesCache = data.changes || [];
    const nominalPower = wecConfigChangesCache.find((c) => c.signal === 'wec_nominal_power')?.value;
    if (Number.isFinite(nominalPower)) {
      ratedCapacityKw = nominalPower;
      if (ratedCapacityEl) {
        ratedCapacityEl.textContent = numberFormatter.format(nominalPower);
      }
    }
  } catch (error) {
    console.warn('Could not refresh static turbine configuration; using fallback rated capacity:', error);
  }
}

async function loadAvailability() {
  try {
    const response = await fetch(AVAILABILITY_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const value = data.series?.availability?.[0];
    const observed = data.timestamps?.[0];
    if (Number.isFinite(value)) {
      availabilityValue = value;
      availabilityObservedAtMs = Number.isFinite(observed) ? observed / 1000 : Date.now();
    }
  } catch (error) {
    console.warn('Could not load daily availability:', error);
  }
  refreshExplorerLiveValue();
}

loadStaticConfiguration();
loadAvailability();
setInterval(loadAvailability, 60 * 60 * 1000);

refreshHourAgoEnergyAnchor();
setInterval(refreshHourAgoEnergyAnchor, 60_000);
refreshTodayStartEnergyAnchor();
setInterval(refreshTodayStartEnergyAnchor, 15 * 60_000);
refreshCarbonIntensity();
setInterval(refreshCarbonIntensity, 5 * 60_000);
refreshWholesalePrice();
setInterval(refreshWholesalePrice, 5 * 60_000);

// --- "Explore more data" panel ---------------------------------------------
function populateSignalSelect() {
  const groups = new Map();
  SIGNAL_CATALOG.forEach((signal) => {
    if (!groups.has(signal.group)) groups.set(signal.group, []);
    groups.get(signal.group).push(signal);
  });
  groups.forEach((signals, groupName) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = groupName;
    signals.forEach((signal) => {
      const option = document.createElement('option');
      option.value = signal.id;
      option.textContent = signal.label;
      optgroup.appendChild(option);
    });
    signalSelectEl.appendChild(optgroup);
  });
  signalSelectEl.value = selectedSignalId;
}

function cacheFor(source) {
  if (source === 'core') return coreCache;
  if (source === 'wecstd') return wecstdCache;
  return null;
}

function staleAfterFor(source) {
  return source === 'wecstd' ? WECSTD_STALE_AFTER_MS : STALE_AFTER_MS;
}

function readSignalNow(signal) {
  if (signal.source === 'availability') {
    return {
      values: [availabilityValue],
      observedAtMs: availabilityObservedAtMs,
      good: Number.isFinite(availabilityValue),
    };
  }
  const cache = cacheFor(signal.source);
  const entries = signal.fields.map((f) => cache[f]);
  const good = entries.every((e) => e && e.good && Number.isFinite(e.value));
  const observedAtMs = good ? Math.min(...entries.map((e) => e.observedAtMs)) : null;
  return {
    values: entries.map((e) => (e && Number.isFinite(e.value) ? e.value : null)),
    observedAtMs,
    good,
  };
}

function isSourceUnavailable(source) {
  if (source === 'core') return unavailable;
  if (source === 'wecstd') return wecstdUnavailable;
  return false;
}

function refreshExplorerLiveValue() {
  const signal = findSignal(selectedSignalId);
  if (!signal) return;
  const { values, observedAtMs, good } = readSignalNow(signal);

  if (signal.multi) {
    signalValueEl.textContent = signal.fields
      .map((_, i) => `${signal.seriesLabels[i]}: ${Number.isFinite(values[i]) ? formatNumber(values[i], signal.decimals) : '--'}`)
      .join('   ');
  } else {
    const value = values[0];
    let text = Number.isFinite(value) ? formatNumber(value, signal.decimals) : '--';
    if (signal.compass && Number.isFinite(value)) text = `${compassLabel(value)} (${text}°)`;
    signalValueEl.textContent = text;
  }
  signalUnitEl.textContent = signal.multi ? '' : signal.unit;

  let state;
  let label;
  if (!good && observedAtMs === null) {
    state = 'offline';
    label = 'Unavailable';
  } else if (!good) {
    state = 'offline';
    label = 'Offline — showing last known reading';
  } else if (isSourceUnavailable(signal.source)) {
    state = 'offline';
    label = 'Offline — showing last known reading';
  } else if (signal.source === 'availability') {
    state = 'good';
    label = `As of ${new Date(observedAtMs).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })}`;
  } else if (Date.now() - observedAtMs > staleAfterFor(signal.source)) {
    state = 'stale';
    label = `Stale · as of ${new Date(observedAtMs).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`;
  } else {
    state = 'good';
    label = `Live · updated ${new Date(observedAtMs).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })}`;
  }
  signalFreshnessEl.textContent = label;
  signalFreshnessEl.className = `explorer-freshness ${state}`;
}

const CHART_COLORS = ['#3ddc84', '#64b5f6', '#f48fb1'];

function clearChart() {
  while (signalChartEl.firstChild) signalChartEl.removeChild(signalChartEl.firstChild);
}

function renderChart(seriesList) {
  clearChart();
  const width = 600;
  const height = 180;
  const padding = 10;
  const allPoints = seriesList.flatMap((s) => s.points);
  if (allPoints.length < 2) return false;

  const ts = allPoints.map((p) => p.t);
  const vs = allPoints.map((p) => p.v);
  const minT = Math.min(...ts);
  const maxT = Math.max(...ts);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);
  const spanV = maxV - minV || 1;
  const spanT = maxT - minT || 1;

  const x = (t) => padding + ((t - minT) / spanT) * (width - 2 * padding);
  const y = (v) => height - padding - ((v - minV) / spanV) * (height - 2 * padding);

  seriesList.forEach((s, i) => {
    if (s.points.length < 2) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = s.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
    path.setAttribute('d', d);
    path.setAttribute('class', 'chart-line');
    path.setAttribute('stroke', CHART_COLORS[i % CHART_COLORS.length]);
    signalChartEl.appendChild(path);
  });

  const makeLabel = (textContent, xPos, yPos, anchor) => {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(xPos));
    text.setAttribute('y', String(yPos));
    text.setAttribute('text-anchor', anchor);
    text.setAttribute('class', 'chart-axis-label');
    text.textContent = textContent;
    signalChartEl.appendChild(text);
  };
  makeLabel(formatNumber(maxV, 1), padding, padding + 10, 'start');
  makeLabel(formatNumber(minV, 1), padding, height - padding, 'start');
  makeLabel(new Date(minT).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }), padding, height - 2, 'start');
  makeLabel(new Date(maxT).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }), width - padding, height - 2, 'end');

  return true;
}

function renderLegend(signal) {
  if (!signal.multi) {
    signalLegendEl.hidden = true;
    signalLegendEl.innerHTML = '';
    return;
  }
  signalLegendEl.hidden = false;
  signalLegendEl.innerHTML = '';
  signal.seriesLabels.forEach((label, i) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = CHART_COLORS[i % CHART_COLORS.length];
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(label));
    signalLegendEl.appendChild(item);
  });
}

async function loadChartFor(signal) {
  const requestToken = ++chartRequestToken;
  chartAbortController?.abort();
  chartAbortController = new AbortController();
  clearChart();
  renderLegend(signal);
  chartStatusEl.hidden = false;
  chartStatusEl.textContent = 'Loading recent history…';

  const end = new Date();
  const start = new Date(end.getTime() - signal.chart.hours * 3600 * 1000);
  const url =
    `${API_BASE}/v1/sites/${SITE}/assets/${ASSET}/data/${signal.chart.family}/range` +
    `?resolution=${signal.chart.resolution}&fields=${signal.fields.join(',')}` +
    `&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;

  try {
    const response = await fetch(url, { signal: chartAbortController.signal });
    if (requestToken !== chartRequestToken) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (requestToken !== chartRequestToken) return;

    const timestamps = data.timestamps || [];
    const seriesQuality = data.series_quality || {};
    const seriesList = signal.fields.map((field, i) => {
      const raw = data.series?.[field] || [];
      const quality = seriesQuality[field] || [];
      const points = [];
      for (let idx = 0; idx < raw.length; idx += 1) {
        const v = raw[idx];
        const t = timestamps[idx];
        const q = quality[idx];
        if (Number.isFinite(v) && Number.isFinite(t) && (q == null || isGoodQuality(q))) {
          points.push({ t: t / 1000, v });
        }
      }
      return { label: signal.multi ? signal.seriesLabels[i] : signal.label, points };
    });

    const hasAnyData = seriesList.some((s) => s.points.length >= 2);
    if (!hasAnyData) {
      chartStatusEl.hidden = false;
      chartStatusEl.textContent = 'No recent history available for this signal.';
      return;
    }
    const rendered = renderChart(seriesList);
    chartStatusEl.hidden = rendered;
    if (!rendered) chartStatusEl.textContent = 'Not enough recent history to draw a chart.';
  } catch (error) {
    if (requestToken !== chartRequestToken) return;
    if (error.name === 'AbortError') return;
    console.warn('Could not load signal history:', error);
    chartStatusEl.hidden = false;
    chartStatusEl.textContent = 'Could not load history for this signal — try again shortly.';
  }
}

function onSignalChange() {
  selectedSignalId = signalSelectEl.value;
  const signal = findSignal(selectedSignalId);
  refreshExplorerLiveValue();
  renderLegend(signal);
  loadChartFor(signal);
}

// =========================================================================
// RIGHT-HAND SIDE STORY DOCK & INTERACTIVE MODAL (Option B)
// =========================================================================
function updateTeaser(index) {
  currentStoryIndex = index;
  const story = STORIES[index];

  teaserTitleEl.style.opacity = '0';
  teaserSnippetEl.style.opacity = '0';

  setTimeout(() => {
    teaserTitleEl.textContent = story.title;
    teaserSnippetEl.textContent = story.teaser;
    storyCounterEl.textContent = `${index + 1} / ${STORIES.length}`;

    const pills = storyPillsContainerEl.querySelectorAll('.story-pill');
    pills.forEach((p, idx) => {
      const isActive = idx === index;
      p.classList.toggle('active', isActive);
      p.setAttribute('aria-selected', String(isActive));
    });

    teaserTitleEl.style.opacity = '1';
    teaserSnippetEl.style.opacity = '1';
  }, 200);
}

function startStoryCycle() {
  stopStoryCycle();
  storyCycleTimer = setInterval(() => {
    if (!isUserHoveringDock && !isModalOpen) {
      const nextIndex = (currentStoryIndex + 1) % STORIES.length;
      updateTeaser(nextIndex);
    }
  }, 14_000);
}

function stopStoryCycle() {
  if (storyCycleTimer) {
    clearInterval(storyCycleTimer);
    storyCycleTimer = null;
  }
}

function renderModalContent(story) {
  modalTagEl.textContent = story.badge;
  modalIconEl.textContent = story.icon;
  modalTitleEl.textContent = story.title;
  modalSubtitleEl.textContent = story.subtitle;

  modalSdgsEl.innerHTML = story.sdgs
    .map(
      (sdg) =>
        `<span class="sdg-badge" style="border-left: 3px solid ${sdg.color}"><strong>${sdg.code}:</strong> ${sdg.name}</span>`
    )
    .join('');

  let quoteHtml = '';
  if (story.quote) {
    const paragraphs = story.quote.text.map((p) => `<p>“${p}”</p>`).join('');
    quoteHtml = `
      <div class="modal-quote-box">
        ${paragraphs}
        <cite class="modal-quote-source">— ${story.quote.source}</cite>
      </div>
    `;
  }

  modalBodyEl.innerHTML = quoteHtml + story.bodyHtml;

  modalLinksEl.innerHTML = story.links
    .map(
      (link) =>
        `<a class="modal-link-btn ${link.primary ? 'primary' : ''}" href="${link.url}" target="_blank" rel="noopener">${link.label}</a>`
    )
    .join('');

  modalDotsEl.innerHTML = STORIES.map(
    (_, idx) =>
      `<button type="button" class="modal-dot ${idx === currentStoryIndex ? 'active' : ''}" data-index="${idx}" aria-label="Go to story ${idx + 1}"></button>`
  ).join('');

  modalDotsEl.querySelectorAll('.modal-dot').forEach((dot) => {
    dot.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      switchModalStory(idx);
    });
  });
}

function openModal(index) {
  isModalOpen = true;
  stopStoryCycle();
  updateTeaser(index);
  renderModalContent(STORIES[index]);

  modalBackdropEl.hidden = false;
  modalCloseBtnEl.focus();
}

function closeModal() {
  isModalOpen = false;
  modalBackdropEl.hidden = true;
  teaserReadBtnEl.focus();
  startStoryCycle();
}

function switchModalStory(index) {
  currentStoryIndex = index;
  updateTeaser(index);
  renderModalContent(STORIES[index]);
}

storyDockEl.addEventListener('mouseenter', () => {
  isUserHoveringDock = true;
});

storyDockEl.addEventListener('mouseleave', () => {
  isUserHoveringDock = false;
});

teaserReadBtnEl.addEventListener('click', () => {
  openModal(currentStoryIndex);
});

storyDockEl.querySelector('#story-dock-teaser').addEventListener('click', (e) => {
  if (e.target !== teaserReadBtnEl) {
    openModal(currentStoryIndex);
  }
});

storyPillsContainerEl.querySelectorAll('.story-pill').forEach((pill, idx) => {
  pill.addEventListener('click', () => {
    openModal(idx);
  });
});

modalCloseBtnEl.addEventListener('click', closeModal);

modalBackdropEl.addEventListener('click', (e) => {
  if (e.target === modalBackdropEl) {
    closeModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isModalOpen) {
    closeModal();
  }
});

modalPrevBtnEl.addEventListener('click', () => {
  const prevIndex = (currentStoryIndex - 1 + STORIES.length) % STORIES.length;
  switchModalStory(prevIndex);
});

modalNextBtnEl.addEventListener('click', () => {
  const nextIndex = (currentStoryIndex + 1) % STORIES.length;
  switchModalStory(nextIndex);
});

explorerToggleEl.addEventListener('click', () => {
  const expanded = explorerToggleEl.getAttribute('aria-expanded') === 'true';
  explorerToggleEl.setAttribute('aria-expanded', String(!expanded));
  explorerPanelEl.hidden = expanded;
  if (!expanded && explorerPanelEl.dataset.loaded !== 'true') {
    explorerPanelEl.dataset.loaded = 'true';
    onSignalChange();
  }
});

signalSelectEl.addEventListener('change', onSignalChange);

statusDockToggleEl.addEventListener('click', () => {
  const expanded = statusDockToggleEl.getAttribute('aria-expanded') === 'true';
  statusDockToggleEl.setAttribute('aria-expanded', String(!expanded));
  statusDockBodyEl.hidden = expanded;
});

statusDockSpecsToggleEl.addEventListener('click', () => {
  const expanded = statusDockSpecsToggleEl.getAttribute('aria-expanded') === 'true';
  const nowExpanded = !expanded;
  statusDockSpecsToggleEl.setAttribute('aria-expanded', String(nowExpanded));
  statusDockSpecsEl.hidden = !nowExpanded;
  statusDockSpecsToggleEl.textContent = nowExpanded ? 'Hide turbine specs ▴' : 'Show turbine specs ▾';
  if (nowExpanded && statusDockSpecsEl.dataset.loaded !== 'true') {
    statusDockSpecsEl.dataset.loaded = 'true';
    loadTurbineSpecsOnce();
  }
});

populateSignalSelect();
updateTeaser(0);
startStoryCycle();
