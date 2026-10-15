import { clamp, powerHue, angleDifference } from './signals.mjs';

const FAR = 18, NEAR = .45, EMIT_SECONDS = .65;
const colour = power => powerHue(power * 4200);

// Catmull–Rom controls keep adjoining screen-space curve tangents continuous.
export function curveControls(points, index, angularity = 0) {
  const p0 = points[Math.max(0, index - 1)], p1 = points[index];
  const p2 = points[index + 1], p3 = points[Math.min(points.length - 1, index + 2)];
  const smooth = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
    p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, ...p2];
  const straight = [p1[0] + (p2[0] - p1[0]) / 3, p1[1] + (p2[1] - p1[1]) / 3,
    p1[0] + (p2[0] - p1[0]) * 2 / 3, p1[1] + (p2[1] - p1[1]) * 2 / 3, ...p2];
  return smooth.map((value, i) => value + (straight[i] - value) * clamp(angularity));
}

// Every emitted cross-section keeps its own colour, wind speed and rotation.
// Startup geometry shares the first real observation; it does not invent a past feed.
export class TunnelMemory {
  constructor() { this.layers = []; this.elapsed = 0; this.rotation = 0; this.serial = 0; }
  layer(z, signal) { return { z, depthTwist: 1, ...signal, twist: this.rotation, serial: this.serial++ }; }
  step(dt, signal) {
    if (!this.layers.length) {
      for (let z = FAR; z > NEAR; z -= .65) {
        this.layers.push(this.layer(z, { ...signal, depthTwist: 0, direction: 0, turbulence: 0 }));
      }
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
    this.canvas = canvas;
    // Keep the persistent wake in a fixed, reusable canvas buffer.
    this.wakeCanvas = canvas.ownerDocument?.createElement('canvas') ?? null;
    this.displayCtx = canvas.getContext('2d');
    this.ctx = this.wakeCanvas?.getContext('2d') ?? this.displayCtx;
    this.width = 1; this.height = 1; // First RAF can precede the ResizeObserver callback.
    this.memory = new TunnelMemory(); this.time = 0; this.lastResting = null;
  }
  resize(width, height, dpr) {
    this.width = width; this.height = height;
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.displayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.wakeCanvas) {
      this.wakeCanvas.width = this.canvas.width; this.wakeCanvas.height = this.canvas.height;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.fillStyle = '#03050c'; this.ctx.fillRect(0, 0, width, height);
    this.lastResting = null;
  }
  circle(layer) {
    const { width: w, height: h } = this;
    const unit = Math.min(w, h) * 1.25;
    // Expand radial depth spacing while anchoring the rotor's apparent size.
    // This opens the distant turns without changing RPM or history emission.
    const sourceDepth = 1 / (28 + .2);
    const depth = sourceDepth + 4 * (1 / (layer.z * 28 / FAR + .2) - sourceDepth);
    const scale = unit * depth;
    const distant = clamp(layer.z / FAR);
    // Historical vane angles shape the path; this screen mapping is not a compass.
    const heading = (layer.direction ?? 0) * Math.PI / 180;
    // Anchor the rotor and viewer on the centreline. Only the intervening wake bends.
    // A zero vane angle must give zero displacement, not a permanent upward curve.
    const bend = 4 * distant * (1 - distant);
    const x = Math.sin(heading) * unit * .20 * bend;
    const y = (1 - Math.cos(heading)) * unit * .10 * bend;
    const roll = this.time * .025;
    const cx = w / 2 + x * Math.cos(roll) - y * Math.sin(roll);
    const cy = h / 2 + x * Math.sin(roll) + y * Math.cos(roll);
    return { cx, cy, radius: scale };
  }
  point(layer, a) {
    const { cx, cy, radius } = this.circle(layer);
    const twist = layer.twist + this.time * .025;
    const theta = a + twist;
    // Blend a circle into a retained, irregular 12-sided cross-section.
    // No deformation at the rotor: all three wake strands meet their blade tips.
    const roughness = clamp((layer.turbulence ?? 0) * 1.4) * clamp((FAR - layer.z) / 3);
    const sector = Math.PI * 2 / 12, vertex = Math.floor(a / sector), fraction = a / sector - vertex;
    const corner = index => {
      const angle = index * sector;
      const r = radius * (1 + .16 * Math.sin(index * Math.PI * 2 / 3 + layer.twist * 1.7));
      return [Math.cos(angle + twist) * r, Math.sin(angle + twist) * r];
    };
    const left = corner(vertex), right = corner(vertex + 1);
    const x = Math.cos(theta) * radius, y = Math.sin(theta) * radius;
    return [cx + x + (left[0] + (right[0] - left[0]) * fraction - x) * roughness,
      cy + y + (left[1] + (right[1] - left[1]) * fraction - y) * roughness];
  }
  wallPoint(layer, a) {
    // Walls and the three blade trails share the same retained rotor phase.
    return this.point(layer, a);
  }
  wakePoint(layer, a) {
    return this.point(layer, a);
  }
  wakeSamples(signal, a) {
    const source = { ...signal, depthTwist: 1, z: FAR, twist: this.memory.rotation };
    const nodes = [source, ...this.memory.layers];
    const samples = [{ point: this.wakePoint(source, a), layer: source }];
    for (let i = 1; i < nodes.length; i++) {
      const from = nodes[i - 1], to = nodes[i];
      const detail = clamp(Math.ceil(Math.max(Math.abs(to.twist - from.twist) * 8, Math.abs(to.z - from.z) * 6)), 3, 16);
      const count = Math.max(1, Math.round(detail * (1 - clamp(to.turbulence ?? 0))));
      for (let j = 1; j <= count; j++) {
        const t = j / count, layer = { ...to };
        for (const key of ['z', 'twist', 'power', 'brightness', 'turbulence', 'depthTwist']) {
          const start = from[key] ?? 0, end = to[key] ?? 0;
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
      return radius * (1 - .32 * clamp((layer.turbulence ?? 0) * 1.4)) <= corner + 8;
    });
  }
  present() {
    if (this.wakeCanvas) {
      this.displayCtx.globalCompositeOperation = 'source-over';
      this.displayCtx.drawImage(this.wakeCanvas, 0, 0, this.width, this.height);
    }
  }

  drawStraightTunnel() {
    const { ctx, width: w, height: h } = this;
    const cx = w / 2, cy = h / 2;
    ctx.strokeStyle = '#263953'; ctx.lineWidth = 1;
    for (let i = 0; i < 23; i++) {
      const r = Math.min(w, h) * .025 * Math.pow(1.22, i);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI * 2 / 24, r = Math.hypot(w, h);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * 12, cy + Math.sin(angle) * 12);
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r); ctx.stroke();
    }
  }
  render(dt, signal, { active, resting, force = false }) {
    if (!active && !force && this.lastResting === resting) return;
    const { ctx, width: w, height: h } = this;
    if (active) { this.time += dt; this.memory.step(dt, signal); this.discardOffscreen(); }
    const stateChanged = this.lastResting !== resting;
    this.lastResting = resting;
    ctx.globalCompositeOperation = 'source-over';
    // Frame-rate-independent phosphor persistence: echoes remain for about 1s.
    const fade = active && !force && !stateChanged && !resting ? 1 - Math.exp(-dt / .19) : 1;
    ctx.fillStyle = `rgba(3,5,12,${fade})`; ctx.fillRect(0, 0, w, h);
    const layers = this.memory.layers;
    if (resting || !layers.length) {
      this.drawStraightTunnel();
      this.present();
      return;
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const attenuation = resting ? .14 : 1;
    // Project each point once; wall filaments reuse the same geometry.
    const geometry = layers.map(layer => Array.from({ length: 97 }, (_, j) => this.wallPoint(layer, j / 96 * Math.PI * 2)));
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
      ctx.strokeStyle = `hsla(${hue},90%,64%,${intensity * .65 * clamp((FAR - layer.z) / 4, 0, 1)})`;
      ctx.lineWidth = clamp(5 / (layer.z + .4), .8, 5);
      ctx.stroke();
    }
    // Three distinct blade trails retain the measured rotor rotation at 120-degree spacing.
    for (let blade = 0; blade < 3; blade++) {
      const samples = this.wakeSamples(signal, blade * Math.PI * 2 / 3);
      const points = samples.map(sample => sample.point);
      for (let i = 0; i < samples.length - 1; i++) {
        const layer = samples[i + 1].layer;
        ctx.beginPath(); ctx.moveTo(...points[i]); ctx.bezierCurveTo(...curveControls(points, i, layer.turbulence ?? 0));
        ctx.strokeStyle = `hsla(${resting ? 220 : colour(layer.power)},95%,74%,${attenuation * (.06 + layer.brightness * .26)})`;
        ctx.lineWidth = clamp(9 / (layer.z + .5), .9, 4.5); ctx.stroke();
      }
    }
    // Twisting wall filaments connect the remembered readings into a tunnel.
    for (let strand = 0; strand < 24; strand++) {
      const a = strand / 24 * Math.PI * 2;
      const points = geometry.map(ring => ring[strand * 4]);
      for (let i = 1; i < layers.length; i++) {
        const older = layers[i], newer = layers[i - 1];
        const [x, y] = geometry[i][strand * 4], [nx, ny] = geometry[i - 1][strand * 4];
        const hue = resting ? 220 : colour(older.power) + Math.sin(a * 3) * 8;
        ctx.beginPath(); ctx.moveTo(nx, ny); ctx.bezierCurveTo(...curveControls(points, i - 1, clamp((older.turbulence ?? 0) * 1.4)));
        ctx.strokeStyle = `hsla(${hue},95%,67%,${attenuation * (.16 + older.brightness * .55) * clamp((FAR - older.z) / 4, 0, 1)})`;
        ctx.lineWidth = clamp(4 / (older.z + .5), .7, 6); ctx.stroke();
        // Bright beads produce streaks that enlarge as they approach the viewer.
        if ((older.serial + strand * 3) % Math.round(36 - Math.sqrt(older.power) * 16) === 0) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x - nx) * .65, y + (y - ny) * .65);
          ctx.strokeStyle = `hsla(${hue},90%,78%,${attenuation * (.12 + older.brightness * .3)})`;
          ctx.lineWidth = clamp(5 / (older.z + .5), 1, 7); ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    const shade = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * .58);
    shade.addColorStop(0, 'rgba(2,3,9,.1)'); shade.addColorStop(.35, 'transparent'); shade.addColorStop(1, 'rgba(2,3,9,.5)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
    this.present();
  }
}
