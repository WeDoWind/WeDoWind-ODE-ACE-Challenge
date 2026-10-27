export const MIXER_SIGNALS = {
  rpm: { label: 'Rotor speed', unit: 'rpm', offset: 15, step: .5, low: 0, high: 30 },
  wind: { label: 'Wind speed', unit: 'm/s', offset: 10, step: .5, low: 0, high: 15 },
  power: { label: 'Power', unit: 'kW', offset: 4200, step: 100, low: -4200, high: 4200 },
  direction: { label: 'Vane angle', unit: 'deg', offset: 180, step: 5 }
};
export const defaultMix = () => Object.fromEntries(Object.keys(MIXER_SIGNALS).map(key => [key, { multiplier: 1, offset: 0 }]));
export const mixActive = mix => Object.values(mix).some(s => s.multiplier !== 1 || s.offset !== 0);
export function mixReading(reading, mix) {
  if (!reading) return null;
  const result = { ...reading };
  for (const [key, spec] of Object.entries(MIXER_SIGNALS)) {
    const value = reading[key].value * mix[key].multiplier + mix[key].offset;
    result[key] = { ...reading[key], value: key === 'direction'
      ? ((value + 180) % 360 + 360) % 360 - 180
      : Math.max(spec.low, Math.min(spec.high, value)) };
  }
  return result;
}
