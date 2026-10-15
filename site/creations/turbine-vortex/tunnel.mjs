import { clamp, powerHue } from './signals.mjs';

const FAR = 28, NEAR = .45, EMIT_SECONDS = .65;
const colour = power => powerHue(power * 4200);

// Every emitted cross-section keeps its own colour, wind deformation and rotation.
// Startup geometry shares the first real observation; it does not invent a past feed.
export class TunnelMemory {
  constructor() { this.layers = []; this.elapsed = 0; this.rotation = 0; this.serial = 0; }
  layer(z, signal) { return { z, ...signal, twist: this.rotation, serial: this.serial++ }; }
  step(dt, signal) {
    if (!this.layers.length) {
      for (let z = FAR; z > NEAR; z -= .65) this.layers.push(this.layer(z, signal));
    }
    this.rotation += clamp(signal.rpm, 0, 30) * Math.PI * 2 / 60 * 1.0 * dt;
    const speed = .4 + signal.wind * 1.2;
    for (const layer of this.layers) layer.z -= speed * dt;
    this.layers = this.layers.filter(layer => layer.z > NEAR);
    this.elapsed += dt;
    while (this.elapsed >= EMIT_SECONDS) {
      this.elapsed -= EMIT_SECONDS;
      this.layers.unshift(this.layer(FAR - speed * this.elapsed, signal));
    }
    this.layers = this.layers.slice(0, 140);
  }
  timeRange() {
    const stamped = this.layers.filter(layer => Number.isFinite(layer.observed));
    return stamped.length ? { oldest: Math.min(...stamped.map(layer => layer.oldestObserved ?? layer.observed)), newest: Math.max(...stamped.map(layer => layer.observed)) } : null;
  }
}

export class TunnelRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.width = 1; this.height = 1; // First RAF can precede the ResizeObserver callback.
    this.memory = new TunnelMemory(); this.time = 0; this.lastResting = null;
  }
  resize(width, height, dpr) {
    this.width = width; this.height = height;
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.fillStyle = '#03050c'; this.ctx.fillRect(0, 0, width, height);
    this.lastResting = null;
  }
  circle(layer) {
    const { width: w, height: h } = this;
    const depth = 1 / (layer.z + .2), scale = Math.max(w, h) * .86 * depth;
    const distant = layer.z / FAR;
    // Historical vane angles shape the path; this screen mapping is not a compass.
    const heading = (layer.direction ?? 0) * Math.PI / 180;
    const bend = Math.pow(distant, .8);
    const cx = w * .52 + Math.sin(heading) * w * .24 * bend;
    const cy = h * .53 - Math.cos(heading) * h * .16 * bend;
    return { cx, cy, radius: scale };
  }
  point(layer, a) {
    const { cx, cy, radius } = this.circle(layer);
    const twist = layer.twist + (FAR - layer.z) * .14;
    const theta = a + twist;
    return [cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius];
  }
  discardOffscreen() {
    this.memory.layers = this.memory.layers.filter(layer => {
      const { cx, cy, radius } = this.circle(layer);
      const corner = Math.max(...[[0,0],[this.width,0],[0,this.height],[this.width,this.height]].map(([x,y]) => Math.hypot(x-cx,y-cy)));
      return radius <= corner + 8;
    });
  }
  drawRotor(signal, resting) {
    const { ctx } = this;
    const source = { ...signal, z: FAR, twist: this.memory.rotation };
    const { cx, cy, radius } = this.circle(source);
    const hue = resting ? 220 : colour(signal.power);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.memory.rotation);
    ctx.fillStyle = `hsla(${hue},65%,80%,${resting ? .2 : .85})`;
    ctx.strokeStyle = `hsla(${hue},90%,75%,${resting ? .15 : .9})`;
    ctx.lineWidth = 1;
    for (let blade = 0; blade < 3; blade++) {
      ctx.save(); ctx.rotate(blade * Math.PI * 2 / 3);
      ctx.beginPath(); ctx.moveTo(radius * .06, -radius * .06);
      ctx.quadraticCurveTo(radius * .4, -radius * .18, radius, 0);
      ctx.quadraticCurveTo(radius * .45, radius * .035, radius * .12, radius * .10);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(radius, 0, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, Math.max(2, radius * .09), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  render(dt, signal, { active, resting, force = false }) {
    if (!active && !force && this.lastResting === resting) return;
    const { ctx, width: w, height: h } = this;
    if (active) { this.time += dt; this.memory.step(dt, signal); this.discardOffscreen(); }
    this.lastResting = resting;
    ctx.globalCompositeOperation = 'source-over';
    // Frame-rate-independent phosphor persistence: echoes remain for about 1.5s.
    const fade = active && !force ? 1 - Math.exp(-dt / .26) : 1;
    ctx.fillStyle = `rgba(3,5,12,${fade})`; ctx.fillRect(0, 0, w, h);
    const layers = this.memory.layers;
    if (!layers.length) {
      ctx.strokeStyle = '#263953'; ctx.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const r = 12 * Math.pow(1.22, i);
        ctx.beginPath(); ctx.arc(w * .52, h * .53, r, 0, Math.PI * 2); ctx.stroke();
      }
      return;
    }
    ctx.globalCompositeOperation = 'lighter';
    const attenuation = resting ? .14 : 1;
    // Project each point once; wall filaments reuse the same geometry.
    const geometry = layers.map(layer => Array.from({ length: 97 }, (_, j) => this.point(layer, j / 96 * Math.PI * 2)));
    // History rings expand in perspective, then pass outside the viewport.
    for (const [index, layer] of layers.entries()) {
      const ripple = .88 + .12 * Math.sin(layer.twist * 2 + layer.z * (.4 + layer.wind));
      const intensity = (.15 + .8 * layer.brightness) * attenuation * ripple;
      const hue = resting ? 220 : colour(layer.power) + ((layer.powerDetail ?? .5) - .5) * 12;
      ctx.beginPath();
      for (let j = 0; j <= 96; j++) {
        const [x, y] = geometry[index][j];
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${hue},90%,64%,${intensity * .4})`;
      ctx.lineWidth = clamp(2.6 / (layer.z + .4), .5, 5);
      ctx.stroke();
    }
    // Three principal wake strands begin at the tips of the rotating rotor.
    for (let blade = 0; blade < 3; blade++) {
      const source = { ...signal, z: FAR, twist: this.memory.rotation };
      let previous = this.point(source, blade * Math.PI * 2 / 3);
      for (const layer of layers) {
        const current = this.point(layer, blade * Math.PI * 2 / 3);
        ctx.beginPath(); ctx.moveTo(...previous); ctx.lineTo(...current);
        ctx.strokeStyle = `hsla(${resting ? 220 : colour(layer.power)},95%,74%,${attenuation * (.15 + layer.brightness * .75)})`;
        ctx.lineWidth = clamp(12 / (layer.z + .5), 1.2, 7); ctx.stroke(); previous = current;
      }
    }
    this.drawRotor(signal, resting);
    // Twisting wall filaments connect the remembered readings into a tunnel.
    for (let strand = 0; strand < 32; strand++) {
      const a = strand / 32 * Math.PI * 2;
      for (let i = 1; i < layers.length; i++) {
        const older = layers[i], newer = layers[i - 1];
        const [x, y] = geometry[i][strand * 3], [nx, ny] = geometry[i - 1][strand * 3];
        const hue = resting ? 220 : colour(older.power) + Math.sin(a * 3) * 8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny);
        ctx.strokeStyle = `hsla(${hue},95%,67%,${attenuation * (.12 + older.brightness * .45)})`;
        ctx.lineWidth = clamp(3 / (older.z + .5), .55, 6); ctx.stroke();
        // Bright beads produce streaks that enlarge as they approach the viewer.
        if ((older.serial + strand * 3) % Math.round(24 - Math.sqrt(older.power) * 14) === 0) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x - nx) * .65, y + (y - ny) * .65);
          ctx.strokeStyle = `hsla(${hue},90%,78%,${attenuation * (.2 + older.brightness * .5)})`;
          ctx.lineWidth = clamp(5 / (older.z + .5), 1, 7); ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    const shade = ctx.createRadialGradient(w * .52, h * .53, 0, w * .52, h * .53, Math.max(w, h) * .58);
    shade.addColorStop(0, 'rgba(2,3,9,.1)'); shade.addColorStop(.35, 'transparent'); shade.addColorStop(1, 'rgba(2,3,9,.5)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
  }
}
