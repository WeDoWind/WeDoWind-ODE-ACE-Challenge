export const FIELDS = ['wec_rotor_speed', 'wec_wind_speed', 'wec_active_power', 'wec_wind_direction'];
export const ENDPOINT = `https://ace-api.duckdns.org/v1/sites/ace/assets/wec-1/data/wec_instantaneous/latest?resolution=1s&fields=${FIELDS.join(',')}&limit=1`;
export const STALE_MS = 60000;
export const WINDOW_MS = 300000;
export const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export const wrapAngle = angle => ((angle + 180) % 360 + 360) % 360 - 180;
export const angleDifference = (target, current) => wrapAngle(target - current);
export const powerHue = power => {
  const level = Math.sqrt(clamp(power / 4200));
  return level < .5 ? 280 - level * 180 : 190 - (level - .5) * 300;
};
export function artworkHue(power, colourLevel, dynamic = false) {
  return powerHue((dynamic ? clamp(colourLevel ?? .5) ** 2 : clamp(power)) * 4200);
}

export function visualTargets(reading, powerDetail = .5, powerMean = reading.power.value, windChange = 0) {
  const wind = clamp(reading.wind.value / 15);
  const power = clamp(reading.power.value / 4200);
  const powerChange = clamp((reading.power.value - powerMean) / Math.max(25, Math.abs(powerMean) * .05), -1, 1);
  return { rpm: clamp(reading.rpm.value, 0, 30), wind, power,
    direction: wrapAngle(reading.direction.value),
    powerDetail,
    turbulence: Math.sqrt(clamp(Math.abs(windChange) / .5)),
    brightness: .5 + .35 * powerChange };
}

export class WindChanges {
  constructor() { this.last = null; this.rate = 0; }
  add(signal) {
    if (this.last && signal.observed <= this.last.observed) return;
    this.rate = this.last && signal.observed - this.last.observed <= STALE_MS
      ? (signal.value - this.last.value) / ((signal.observed - this.last.observed) / 1000) : 0;
    this.last = { ...signal };
  }
}

export function parseSignals(data) {
  const signals = FIELDS.map(field => {
    const value = data?.series?.[field]?.[0];
    const timestamp = data?.series_observed_at?.[field]?.[0];
    if (!Number.isFinite(value)) throw new Error(`Missing or invalid ${field} reading`);
    if (String(data?.series_quality?.[field]?.[0]).toLowerCase() !== 'good') throw new Error(`Non-Good quality for ${field}`);
    if (!Number.isFinite(timestamp) || timestamp <= 0 ||
      !Number.isFinite(new Date(timestamp / 1000).getTime())) throw new Error(`Missing or invalid ${field} observation time`);
    if (['wec_rotor_speed', 'wec_wind_speed'].includes(field) && value < 0) throw new Error(`Negative ${field}`);
    return { value, observed: timestamp / 1000 };
  });
  const newest = Math.max(...signals.map(s => s.observed));
  const collected = data?.collection_timestamps?.[0];
  const collectedMs = Number.isFinite(collected) && collected > 0 ? collected / 1000 : newest;
  return { rpm: signals[0], wind: signals[1], power: signals[2], direction: signals[3],
    oldest: Math.min(...signals.map(s => s.observed)), newest, dataTime: Math.max(newest, collectedMs) };
}

// Freshness uses API-relative ages and monotonic time since each field advanced.
// Changing the computer's wall clock cannot make data fresh or stale.
export class SignalFreshness {
  constructor() { this.fields = new Map(); this.dataTime = 0; }
  update(reading, now = performance.now()) {
    this.dataTime = reading.dataTime;
    for (const key of ['rpm', 'wind', 'power', 'direction']) {
      const observed = reading[key].observed, previous = this.fields.get(key);
      if (!previous || observed > previous.observed) this.fields.set(key, { observed, advanced: now, initialAge: Math.max(0, reading.dataTime - observed) });
    }
  }
  stale(now = performance.now()) {
    return [...this.fields.values()].some(s => Math.max(s.initialAge + now - s.advanced, this.dataTime - s.observed) > STALE_MS);
  }
}

// Piecewise-constant, time-weighted trailing mean in observation-time coordinates.
export class PowerAverage {
  constructor() { this.samples = []; }
  add(value, observed) {
    const last = this.samples.at(-1);
    if (last && observed <= last.observed) return;
    if (last && observed - last.observed > STALE_MS) this.samples = [];
    this.samples.push({ value, observed });
    this.samples = this.samples.slice(-256);
    const cutoff = observed - 30000;
    while (this.samples.length > 1 && this.samples[1].observed <= cutoff) this.samples.shift();
  }
  mean() {
    const latest = this.samples.at(-1);
    if (!latest) return null;
    const start = Math.max(latest.observed - 30000, this.samples[0].observed);
    if (latest.observed === start) return latest.value;
    let area = 0;
    for (let i = 0; i < this.samples.length - 1; i++) {
      const sample = this.samples[i], next = this.samples[i + 1];
      area += sample.value * Math.max(0, next.observed - Math.max(start, sample.observed));
    }
    return area / (latest.observed - start);
  }
}

// Quantiles resist spikes; minimum spans resist amplification of sensor noise.
export class AdaptiveRange {
  constructor(minSpan) { this.minSpan = minSpan; this.samples = []; this.center = null; this.span = minSpan; this.last = null; }
  add(value, observed, now = observed) {
    this.samples = this.samples.filter(s => s.observed >= now - WINDOW_MS);
    if (this.last === null || observed > this.last) { this.samples.push({ value, observed }); this.samples = this.samples.slice(-512); this.last = observed; }
    const sorted = this.samples.map(s => s.value).sort((a, b) => a - b);
    if (!sorted.length) return;
    const quantile = q => sorted[Math.floor((sorted.length - 1) * q)];
    const low = quantile(.1), high = quantile(.9);
    const center = (low + high) / 2, span = Math.max(this.minSpan, high - low);
    const dt = this.updated == null ? 0 : Math.max(0, now - this.updated);
    const alpha = 1 - Math.exp(-dt / 30000);
    this.center = this.center == null ? center : this.center + (center - this.center) * alpha;
    this.span += (span - this.span) * alpha;
    this.updated = now;
  }
  normalize(value) { return this.center === null ? .5 : clamp(.5 + (value - this.center) / this.span); }
}
