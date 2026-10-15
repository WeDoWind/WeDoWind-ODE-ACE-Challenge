import { clamp, powerHue, angleDifference } from './signals.mjs';

const FAR = 28, NEAR = .45, EMIT_SECONDS = .65;
const colour = power => powerHue(power * 4200);

// Catmull–Rom controls keep adjoining screen-space curve tangents continuous.
export function curveControls(points, index) {
  const p0 = points[Math.max(0, index - 1)], p1 = points[index];
  const p2 = points[index + 1], p3 = points[Math.min(points.length - 1, index + 2)];
  return [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
    p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, ...p2];
}

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
    const unit = Math.min(w, h) * 1.25;
    const depth = 1 / (layer.z + .2), scale = unit * depth;
    const distant = layer.z / FAR;
    // Historical vane angles shape the path; this screen mapping is not a compass.
    const heading = (layer.direction ?? 0) * Math.PI / 180;
    const bend = Math.pow(distant, .8);
    const cx = w / 2 + Math.sin(heading) * unit * .20 * bend;
    const cy = h / 2 - Math.cos(heading) * unit * .20 * bend;
    return { cx, cy, radius: scale };
  }
  point(layer, a) {
    const { cx, cy, radius } = this.circle(layer);
    const twist = layer.twist + (FAR - layer.z) * .14;
    const theta = a + twist;
    return [cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius];
  }
  wakePoint(layer, a) {
    return this.point(layer, a);
  }
  eddyState(layer, blade) {
    const distance = Math.max(0, FAR - layer.z), envelope = 1 - Math.exp(-distance / 3);
    const strength = (layer.shedding ?? 0) * envelope;
    const center = this.wakePoint(layer, blade * Math.PI * 2 / 3);
    const radius = clamp(this.circle(layer).radius * (.035 + strength * .035), 2, 30);
    const flutter = radius * .45 * (layer.turbulence ?? 0);
    return { x: center[0] + Math.sin(this.time * 5 + layer.serial + blade) * flutter,
      y: center[1] + Math.cos(this.time * 6 + layer.serial + blade) * flutter,
      radius, strength, spin: this.time * (1.5 + (layer.shedding ?? 0) * 4) * (layer.curlSign ?? 1) + layer.serial * .8 + blade };
  }
  drawEddies(resting) {
    const { ctx } = this;
    for (const layer of this.memory.layers) {
      if ((layer.shedding ?? 0) < .08) continue;
      const spacing = Math.round(8 - (layer.shedding ?? 0) * 5);
      for (let blade = 0; blade < 3; blade++) {
        if ((layer.serial + blade * 2) % spacing !== 0) continue;
        const eddy = this.eddyState(layer, blade);
        if (eddy.strength < .05) continue;
        ctx.save(); ctx.translate(eddy.x, eddy.y); ctx.rotate(eddy.spin);
        // A soft dark halo keeps each little whirl readable over the bright wake.
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(3,5,12,${resting ? .15 : .45})`;
        ctx.beginPath(); ctx.arc(0, 0, eddy.radius * 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `hsla(${resting ? 220 : colour(layer.power) + 18},90%,82%,${(resting ? .12 : .5 + eddy.strength * .45)})`;
        ctx.lineWidth = clamp(eddy.radius / 10, .8, 2);
        for (let arm = 0; arm < 2; arm++) {
          ctx.beginPath();
          for (let j = 0; j <= 40; j++) {
            const t = j / 40, angle = t * Math.PI * 3 + arm * Math.PI;
            const r = eddy.radius * (.08 + t * .92);
            const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
            if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  wakeSamples(signal, a) {
    const source = { ...signal, z: FAR, twist: this.memory.rotation };
    const nodes = [source, ...this.memory.layers];
    const samples = [{ point: this.wakePoint(source, a), layer: source }];
    for (let i = 1; i < nodes.length; i++) {
      const from = nodes[i - 1], to = nodes[i];
      const count = clamp(Math.ceil(Math.max(Math.abs(to.twist - from.twist) * 8, Math.abs(to.z - from.z) * 6)), 3, 16);
      for (let j = 1; j <= count; j++) {
        const t = j / count, layer = { ...to };
        for (const key of ['z', 'twist', 'power', 'brightness', 'turbulence', 'shedding', 'curlSign']) {
          const start = from[key] ?? (key === 'curlSign' ? 1 : 0), end = to[key] ?? (key === 'curlSign' ? 1 : 0);
          layer[key] = start + (end - start) * t;
        }
        layer.direction = (from.direction ?? 0) + angleDifference(to.direction ?? 0, from.direction ?? 0) * t;
        samples.push({ point: this.wakePoint(layer, a), layer });
      }
    }
    return samples;
  }
  discardOffscreen() {
    this.memory.layers = this.memory.layers.filter(layer => {
      const { cx, cy, radius } = this.circle(layer);
      const corner = Math.max(...[[0,0],[this.width,0],[0,this.height],[this.width,this.height]].map(([x,y]) => Math.hypot(x-cx,y-cy)));
      // Eddies belong to their layer and disappear with it; no particle backlog.
      return radius <= corner + 52;
    });
  }
  drawRotor(signal, resting) {
    const { ctx } = this;
    const source = { ...signal, z: FAR, twist: this.memory.rotation };
    const { cx, cy, radius } = this.circle(source);
    const hue = resting ? 220 : colour(signal.power);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.memory.rotation);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(3,5,12,.88)';
    ctx.beginPath(); ctx.arc(0, 0, radius * .75, 0, Math.PI * 2); ctx.fill();
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
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
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
      const samples = this.wakeSamples(signal, blade * Math.PI * 2 / 3);
      const points = samples.map(sample => sample.point);
      for (let i = 0; i < samples.length - 1; i++) {
        const layer = samples[i + 1].layer;
        ctx.beginPath(); ctx.moveTo(...points[i]); ctx.bezierCurveTo(...curveControls(points, i));
        ctx.strokeStyle = `hsla(${resting ? 220 : colour(layer.power)},95%,74%,${attenuation * (.15 + layer.brightness * .75)})`;
        ctx.lineWidth = clamp(12 / (layer.z + .5), 1.2, 7); ctx.stroke();
      }
    }
    // Twisting wall filaments connect the remembered readings into a tunnel.
    for (let strand = 0; strand < 32; strand++) {
      const a = strand / 32 * Math.PI * 2;
      const points = geometry.map(ring => ring[strand * 3]);
      for (let i = 1; i < layers.length; i++) {
        const older = layers[i], newer = layers[i - 1];
        const [x, y] = geometry[i][strand * 3], [nx, ny] = geometry[i - 1][strand * 3];
        const hue = resting ? 220 : colour(older.power) + Math.sin(a * 3) * 8;
        ctx.beginPath(); ctx.moveTo(nx, ny); ctx.bezierCurveTo(...curveControls(points, i - 1));
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
    this.drawEddies(resting);
    this.drawRotor(signal, resting);
    ctx.globalCompositeOperation = 'source-over';
    const shade = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * .58);
    shade.addColorStop(0, 'rgba(2,3,9,.1)'); shade.addColorStop(.35, 'transparent'); shade.addColorStop(1, 'rgba(2,3,9,.5)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
  }
}
