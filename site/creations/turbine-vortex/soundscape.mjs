// Original procedural synthesis: no samples, dependencies, or extra data requests.
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export function soundTargets(reading) {
  const rpm = clamp(reading.rpm.value, 0, 30);
  const wind = clamp(reading.wind.value / 15, 0, 2);
  const power = clamp(reading.power.value / 4200, 0, 1);
  const angle = ((reading.direction.value + 180) % 360 + 360) % 360 - 180;
  return { bpm: rpm * 9, cutoff: 180 + wind * 3000, pitchCents: wind * 1200,
    intensity: .15 + Math.sqrt(power) * .65, pan: clamp(angle / 90, -.8, .8) };
}

export class Soundscape {
  constructor() { this.context = null; this.volume = .25; this.active = false; this.step = 0; }
  async start() {
    if (!this.context) {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) throw new Error('Web Audio is unavailable in this browser');
      const c = this.context = new Audio();
      // One smoothed transposition keeps the drone and every arpeggio voice in tune.
      this.pitch = c.createConstantSource(); this.pitch.offset.value = 0;
      this.pitch.start();
      this.master = c.createGain(); this.master.gain.value = 0;
      const compressor = c.createDynamicsCompressor();
      compressor.threshold.value = -18; compressor.ratio.value = 6;
      this.master.connect(compressor).connect(c.destination);
      this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.Q.value = 2;
      this.pan = c.createStereoPanner();
      this.filter.connect(this.pan).connect(this.master);
      this.drone = c.createGain(); this.drone.gain.value = .08;
      this.drone.connect(this.filter);
      for (const [frequency, detune] of [[55, -5], [55, 5], [82.4069, 0]]) {
        const osc = c.createOscillator(); osc.type = 'sawtooth';
        osc.frequency.value = frequency; osc.detune.value = detune;
        this.pitch.connect(osc.detune);
        osc.connect(this.drone); osc.start();
      }
      this.delay = c.createDelay(1); this.delay.delayTime.value = .32;
      const feedback = c.createGain(); feedback.gain.value = .28;
      const wet = c.createGain(); wet.gain.value = .22;
      this.delay.connect(feedback).connect(this.delay);
      this.delay.connect(wet).connect(this.filter);
    }
    await this.context.resume();
  }
  update(reading, active) {
    this.active = !!active;
    if (!this.context) return;
    const c = this.context, t = c.currentTime;
    this.master.gain.setTargetAtTime(active ? this.volume : 0, t, .15);
    if (!active) { this.next = t; return; }
    const target = soundTargets(reading);
    this.pitch.offset.setTargetAtTime(target.pitchCents, t, .8);
    this.filter.frequency.setTargetAtTime(target.cutoff, t, .8);
    this.pan.pan.setTargetAtTime(target.pan, t, 2);
    this.drone.gain.setTargetAtTime(.04 + target.intensity * .08, t, .8);
    // Zero RPM stops new rhythmic voices; existing notes/delay decay naturally.
    if (target.bpm === 0) { this.next = null; this.step = 0; this.lastBpm = 0; return; }
    // Preserve the fraction of the current subdivision when rotor speed changes.
    if (this.lastBpm && this.next > t) this.next = t + (this.next - t) * this.lastBpm / target.bpm;
    this.lastBpm = target.bpm;
    // Schedule only a short lookahead; inactive pages never accumulate a score.
    if (!this.next || this.next < t) this.next = t;
    while (this.next < t + .12) {
      const at = this.next;
      const notes = [0, 7, 12, 15, 19, 15, 12, 7]; // A minor, fixed artistic harmony.
      const osc = c.createOscillator(), envelope = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 110 * 2 ** (notes[this.step % notes.length] / 12);
      this.pitch.connect(osc.detune);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(.12 * target.intensity, at + .008);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + .24);
      osc.connect(envelope); envelope.connect(this.filter); envelope.connect(this.delay);
      osc.start(at); osc.stop(at + .25);
      osc.onended = () => { this.pitch.disconnect(osc.detune); osc.disconnect(); envelope.disconnect(); };
      if (this.step % 4 === 0) {
        const kick = c.createOscillator(), gain = c.createGain();
        kick.frequency.setValueAtTime(110, at);
        kick.frequency.exponentialRampToValueAtTime(40, at + .16);
        gain.gain.setValueAtTime(.18 * target.intensity, at);
        gain.gain.exponentialRampToValueAtTime(.0001, at + .22);
        kick.connect(gain).connect(this.master); kick.start(at); kick.stop(at + .23);
        kick.onended = () => { kick.disconnect(); gain.disconnect(); };
      }
      this.next += 60 / target.bpm / 4; this.step++;
    }
  }
  async suspend() {
    this.active = false;
    if (this.context) await this.context.suspend();
  }
}
