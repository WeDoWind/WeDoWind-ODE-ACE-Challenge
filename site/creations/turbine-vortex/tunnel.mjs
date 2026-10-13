import { clamp } from './signals.mjs';

const FAR = 28, NEAR = .45, EMIT_SECONDS = .48;
const colour = power => power < .5 ? 280 - power * 180 : 190 - (power - .5) * 300;

// Every emitted cross-section keeps its own colour, wind deformation and rotation.
// Startup geometry shares the first real observation; it does not invent a past feed.
export class TunnelMemory {
  constructor() { this.layers = []; this.elapsed = 0; this.rotation = 0; this.serial = 0; }
  layer(z, signal) { return { z, ...signal, twist: this.rotation, serial: this.serial++ }; }
  step(dt, signal) {
    if (!this.layers.length) {
      for (let z = FAR; z > NEAR; z -= .65) this.layers.push(this.layer(z, signal));
    }
    this.rotation += clamp(signal.rpm, 0, 30) * Math.PI * 2 / 60 * .65 * dt;
    const speed = .65 + signal.wind * .65;
    for (const layer of this.layers) layer.z -= speed * dt;
    this.layers = this.layers.filter(layer => layer.z > NEAR);
    this.elapsed += dt;
    while (this.elapsed >= EMIT_SECONDS) {
      this.elapsed -= EMIT_SECONDS;
      this.layers.unshift(this.layer(FAR - speed * this.elapsed, signal));
    }
    this.layers = this.layers.slice(0, 110);
  }
}

export class TunnelRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.memory = new TunnelMemory(); this.time = 0; this.lastResting = null;
  }
  resize(width, height, dpr) {
    this.width = width; this.height = height;
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.fillStyle = '#03050c'; this.ctx.fillRect(0, 0, width, height);
    this.lastResting = null;
  }
  point(layer, a) {
    const { width: w, height: h } = this;
    const depth = 1 / (layer.z + .2), scale = Math.max(w, h) * .86 * depth;
    const distant = layer.z / FAR;
    const cx = w * .59 + Math.sin(this.time * .19 + distant * 2.8) * w * .065 * distant;
    const cy = h * .53 + Math.cos(this.time * .14 + distant * 3.1) * h * .055 * distant;
    const twist = layer.twist + layer.z * .14 + this.memory.rotation * .28;
    const theta = a + twist;
    const ripple = 1 + Math.sin(a * 5 + layer.twist * 2) * (.045 + layer.wind * .10)
      + Math.cos(a * 3 - layer.twist) * .07;
    return [cx + Math.cos(theta) * scale * ripple, cy + Math.sin(theta) * scale * ripple * .83];
  }
  render(dt, signal, { active, resting, force = false }) {
    if (!active && !force && this.lastResting === resting) return;
    const { ctx, width: w, height: h } = this;
    if (active) { this.time += dt; this.memory.step(dt, signal); }
    this.lastResting = resting;
    ctx.globalCompositeOperation = 'source-over';
    // Frame-rate-independent phosphor persistence: echoes remain for about 1.5s.
    const fade = active && !force ? 1 - Math.exp(-dt / .32) : 1;
    ctx.fillStyle = `rgba(3,5,12,${fade})`; ctx.fillRect(0, 0, w, h);
    const layers = this.memory.layers;
    if (!layers.length) {
      ctx.strokeStyle = '#263953'; ctx.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const r = 12 * Math.pow(1.22, i);
        ctx.beginPath(); ctx.ellipse(w * .59, h * .53, r, r * .83, i * .04, 0, Math.PI * 2); ctx.stroke();
      }
      return;
    }
    ctx.globalCompositeOperation = 'lighter';
    const attenuation = resting ? .14 : 1;
    // History rings expand in perspective, then pass outside the viewport.
    for (const layer of layers) {
      const intensity = (.15 + .8 * layer.brightness) * attenuation;
      const hue = resting ? 220 : colour(layer.power);
      ctx.beginPath();
      for (let j = 0; j <= 96; j++) {
        const [x, y] = this.point(layer, j / 96 * Math.PI * 2);
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${hue},95%,65%,${intensity * .42})`;
      ctx.lineWidth = clamp(2.6 / (layer.z + .4), .5, 5);
      ctx.stroke();
    }
    // Twisting wall filaments connect the remembered readings into a tunnel.
    for (let strand = 0; strand < 32; strand++) {
      const a = strand / 32 * Math.PI * 2;
      for (let i = 1; i < layers.length; i++) {
        const older = layers[i], newer = layers[i - 1];
        const [x, y] = this.point(older, a), [nx, ny] = this.point(newer, a);
        const hue = resting ? 220 : colour(older.power) + Math.sin(a * 3) * 24;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny);
        ctx.strokeStyle = `hsla(${hue},100%,72%,${attenuation * (.17 + older.brightness * .4)})`;
        ctx.lineWidth = clamp(3 / (older.z + .5), .55, 6); ctx.stroke();
        // Bright beads produce streaks that enlarge as they approach the viewer.
        if ((older.serial + strand * 3) % 13 === 0) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x - nx) * .65, y + (y - ny) * .65);
          ctx.strokeStyle = `hsla(${hue},100%,85%,${attenuation * .85})`;
          ctx.lineWidth = clamp(5 / (older.z + .5), 1, 7); ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    const shade = ctx.createRadialGradient(w * .59, h * .53, 0, w * .59, h * .53, Math.max(w, h) * .58);
    shade.addColorStop(0, 'rgba(2,3,9,.1)'); shade.addColorStop(.35, 'transparent'); shade.addColorStop(1, 'rgba(2,3,9,.5)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
  }
}
