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
export function visualTargets(reading, windDetail = .5, powerDetail = .5) {
  const wind = clamp(reading.wind.value / 15);
  const power = clamp(reading.power.value / 4200);
  return { rpm: clamp(reading.rpm.value, 0, 30), wind, power,
    direction: wrapAngle(reading.direction.value),
    windDetail, powerDetail,
    brightness: .24 + .55 * Math.sqrt(power) };
}

export function parseSignals(data, now = Date.now()) {
  const signals = FIELDS.map(field => {
    const value = data?.series?.[field]?.[0];
    const timestamp = data?.series_observed_at?.[field]?.[0];
    if (!Number.isFinite(value) || !Number.isFinite(timestamp) ||
      String(data?.series_quality?.[field]?.[0]).toLowerCase() !== 'good' ||
      timestamp <= 0 || timestamp / 1000 > now + 5000 ||
      !Number.isFinite(new Date(timestamp / 1000).getTime())) throw new Error(`Invalid ${field}`);
    if (['wec_rotor_speed', 'wec_wind_speed'].includes(field) && value < 0) throw new Error(`Negative ${field}`);
    return { value, observed: timestamp / 1000 };
  });
  return { rpm: signals[0], wind: signals[1], power: signals[2], direction: signals[3], oldest: Math.min(...signals.map(s => s.observed)) };
}

// Quantiles resist spikes; minimum spans resist amplification of sensor noise.
export class AdaptiveRange {
  constructor(minSpan) { this.minSpan = minSpan; this.samples = []; this.center = null; this.span = minSpan; this.last = null; }
  add(value, observed, now = Date.now()) {
    this.samples = this.samples.filter(s => s.observed >= now - WINDOW_MS);
    if (this.last === null || observed > this.last) { this.samples.push({ value, observed }); this.last = observed; }
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
