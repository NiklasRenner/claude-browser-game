/**
 * Things in a backdrop that move: rifts and auroras in the sky, lightning,
 * fire, drifting fog, and weather (ash, snow, spores, embers, dust). Drawn
 * every frame straight onto the stage's canvas and its glow canvas.
 */
import { makeCanvas } from '../pixel/painter';
import { bayer, fbm, hash, noise } from '../pixel/noise';
import { FIRE, WARP, css, hex } from '../pixel/palette';
import type { RGB } from '../pixel/palette';

export type Weather = 'ash' | 'snow' | 'spores' | 'embers' | 'dust' | 'debris';
export type SkyEffect = 'rift' | 'aurora' | 'lightning';

export interface AmbientSpec {
  sky?: SkyEffect[];
  /** Where the rift / aurora sits, as fractions of width and horizon height. */
  skyAt?: [number, number];
  weather: Weather;
  /** Weather colour (ash grey, spore green…). */
  tint: string;
  fog: string;
}

interface Mote { x: number; y: number; s: number; ph: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; age: number; col: RGB }

const AURORA = [hex('#1d6b5a'), hex('#2fae7a'), hex('#7af0b0'), hex('#b8a0ff')];

export class Ambient {
  private motes: Mote[];
  private sparks: Spark[] = [];
  private fog: HTMLCanvasElement;
  private riftCan = makeCanvas(48, 84);
  private riftData = new ImageData(48, 84);
  private bolt: { pts: [number, number][]; life: number } | null = null;
  private nextBolt = 4;
  /** The aurora, one band at a time (drawn as pixels, then laid over the sky). */
  private auroraCan: HTMLCanvasElement | null = null;
  private auroraData: ImageData | null = null;
  /** Weather colours: small motes, big ones, and their glow. */
  private tintCss: [string, string, string];

  constructor(private spec: AmbientSpec, private W: number, private H: number, private horizon: number, private flames: [number, number][]) {
    const tint = hex(spec.tint);
    this.tintCss = [css(tint, 0.6), css(tint, 1), css(tint)];
    const count = Math.round((W * H) / (spec.weather === 'snow' ? 500 : 800));
    this.motes = Array.from({ length: count }, (_, i) => ({ x: hash(i, 1) * W, y: hash(i, 2) * H, s: 3 + hash(i, 3) * 9, ph: hash(i, 4) * 6 }));
    this.fog = makeFog(W, hex(spec.fog));
  }

  /** Sky effects: between the sky and the skyline. */
  drawSky(ctx: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number, dt: number) {
    const [fx, fy] = this.spec.skyAt ?? [0.5, 0.3];
    for (const e of this.spec.sky ?? []) {
      if (e === 'rift') this.rift(ctx, g, Math.round(this.W * fx), Math.round(this.horizon * fy), t);
      else if (e === 'aurora') this.aurora(ctx, g, t);
      else this.lightning(ctx, g, dt, Math.round(this.W * fx), Math.round(this.horizon * fy));
    }
  }

  /** Fire, fog and weather: in front of everything except the vignette. */
  drawFront(ctx: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number, dt: number) {
    for (const [x, y] of this.flames) this.fire(ctx, g, x, y, t);
    this.updateSparks(ctx, g, dt);
    // Two fog bands drifting at different speeds.
    for (const [y, speed, a] of [[this.horizon - 14, 4, 0.5], [this.horizon + (this.H - this.horizon) * 0.45, 9, 0.3]] as const) {
      ctx.globalAlpha = a;
      const off = (t * speed) % this.W;
      ctx.drawImage(this.fog, -off, Math.round(y));
      ctx.globalAlpha = 1;
    }
    this.weather(ctx, g, t, dt);
  }

  private rift(ctx: CanvasRenderingContext2D, g: CanvasRenderingContext2D, rx: number, ry: number, t: number) {
    const d = this.riftData.data;
    d.fill(0);
    for (let y = 0; y < 84; y++) {
      const yy = y - 42, yn = yy / 26;
      if (Math.abs(yn) > 1) continue;
      const w = 10 * Math.pow(1 - yn * yn, 0.9) * (0.7 + 0.6 * noise(y * 0.22, t * 0.9));
      const cx = 24 + Math.sin(y * 0.14 + t * 0.6) * 1.6 - yy * 0.35;
      for (let x = 0; x < 48; x++) {
        const dx = x - cx, ad = Math.abs(dx);
        let col: RGB | null = null;
        if (ad < w) {
          const s = 1 - ad / w;
          const v = Math.pow(s, 1.6) * 1.05 + fbm(dx * 0.25 + 3, y * 0.11 - t * 1.1, 2) * 0.75 - 0.4 + bayer(x, y) * 0.35;
          col = WARP[Math.max(0, Math.min(5, Math.round(v * 5)))]!;
        } else if (ad < w + 4 && hash(x * 3 + Math.floor(t * 10), y) < 0.12 * (1 - (ad - w) / 4)) col = WARP[3]!;
        if (col) { const j = (y * 48 + x) * 4; d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255; }
      }
    }
    this.riftCan.getContext('2d')!.putImageData(this.riftData, 0, 0);
    ctx.drawImage(this.riftCan, rx - 24, ry - 42);
    g.globalAlpha = 0.45;
    g.drawImage(this.riftCan, rx - 24, ry - 42);
    g.globalAlpha = 1;
  }

  private aurora(ctx: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number) {
    const { W, H } = this;
    const can = (this.auroraCan ??= makeCanvas(W, H)), img = (this.auroraData ??= new ImageData(W, H)), d = img.data;
    const glowAlpha = g.globalAlpha;
    for (let band = 0; band < 2; band++) {
      d.fill(0);
      for (let x = 0; x < W; x++) {
        const base = this.horizon * (0.18 + band * 0.12) + Math.sin(x * 0.03 + t * 0.4 + band) * 8 + noise(x * 0.05, t * 0.3 + band * 5) * 10;
        const len = 10 + noise(x * 0.08 + band * 9, t * 0.5) * 22;
        for (let k = 0; k < len; k++) {
          const v = 1 - k / len + Math.sin(x * 0.2 + t * 2) * 0.1;
          const y = Math.round(base + k);
          if (bayer(x, k) + 0.5 > v * 1.2 || y < 0 || y >= H) continue;
          const col = AURORA[Math.max(0, Math.min(3, Math.floor((1 - v) * 3 + band)))]!;
          const j = (y * W + x) * 4;
          d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255;
        }
      }
      can.getContext('2d')!.putImageData(img, 0, 0);
      ctx.globalAlpha = 0.45; ctx.drawImage(can, 0, 0); ctx.globalAlpha = 1;
      g.globalAlpha = 0.4; g.drawImage(can, 0, 0); g.globalAlpha = glowAlpha;
    }
  }

  private lightning(ctx: CanvasRenderingContext2D, g: CanvasRenderingContext2D, dt: number, sx: number, sy: number) {
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      const pts: [number, number][] = [[sx + (Math.random() - 0.5) * 6, sy + 24]];
      let [x, y] = pts[0]!;
      const tx = this.W * (0.3 + Math.random() * 0.6);
      while (y < this.horizon - 20) { y += 3 + Math.random() * 4; x += (tx - x) * 0.18 + (Math.random() - 0.5) * 8; pts.push([x, y]); }
      this.bolt = { pts, life: 0.22 };
      this.nextBolt = 5 + Math.random() * 6;
    }
    if (!this.bolt) return;
    this.bolt.life -= dt;
    if (this.bolt.life <= 0) { this.bolt = null; return; }
    ctx.fillStyle = 'rgba(160,90,210,0.07)';
    ctx.fillRect(0, 0, this.W, this.horizon);
    const pts = this.bolt.pts;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      for (let k = 0; k <= n; k++) {
        const px = Math.round(x0 + ((x1 - x0) * k) / n), py = Math.round(y0 + ((y1 - y0) * k) / n);
        ctx.fillStyle = '#f2dcff'; ctx.fillRect(px, py, 1, 1);
        g.fillStyle = '#c070ff'; g.fillRect(px - 1, py, 3, 1);
      }
    }
  }

  private fire(ctx: CanvasRenderingContext2D, g: CanvasRenderingContext2D, bx: number, by: number, t: number) {
    const fl = 0.85 + Math.sin(t * 11 + bx) * 0.1 + Math.sin(t * 23) * 0.05;
    const grad = g.createRadialGradient(bx, by, 0, bx, by, 46);
    grad.addColorStop(0, `rgba(255,140,50,${0.32 * fl})`);
    grad.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = grad;
    g.fillRect(bx - 50, by - 50, 100, 100);
    for (let yy = 0; yy < 12; yy++) {
      const w = Math.max(0, (1 - yy / 12) * 4.5 * (0.7 + 0.5 * noise(yy * 0.6, t * 6 + bx)));
      const sway = Math.sin(t * 5 + yy * 0.5) * yy * 0.15;
      for (let xx = -Math.ceil(w); xx <= Math.ceil(w); xx++) {
        if (Math.abs(xx) > w) continue;
        const heat = 1 - Math.abs(xx) / (w + 0.5) - yy / 16 + bayer(xx, yy) * 0.3;
        const col = css(FIRE[Math.max(0, Math.min(5, Math.round(heat * 5.5)))]!);
        const px = Math.round(bx + xx + sway), py = by - yy;
        ctx.fillStyle = col; ctx.fillRect(px, py, 1, 1);
        g.fillStyle = col; g.fillRect(px, py, 1, 1);
      }
    }
    if (Math.random() < 0.4) this.sparks.push({ x: bx + (Math.random() - 0.5) * 6, y: by - 3, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 16, life: 1 + Math.random(), age: 0, col: FIRE[3 + Math.floor(Math.random() * 2)]! });
  }

  private updateSparks(ctx: CanvasRenderingContext2D, g: CanvasRenderingContext2D, dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.age += dt;
      if (s.age >= s.life) { this.sparks.splice(i, 1); continue; }
      s.x += (s.vx + Math.sin(s.age * 6 + s.y * 0.2) * 6) * dt;
      s.y += s.vy * dt;
      const k = s.age / s.life;
      if (k > 0.7 && bayer(Math.round(s.x), Math.round(s.y)) + 0.5 < (k - 0.7) / 0.3) continue;
      const c = css(s.col);
      ctx.fillStyle = c; ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      g.fillStyle = c; g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
  }

  private weather(ctx: CanvasRenderingContext2D, g: CanvasRenderingContext2D, t: number, dt: number) {
    const kind = this.spec.weather;
    const glows = kind === 'spores' || kind === 'embers';
    for (const m of this.motes) {
      switch (kind) {
        case 'ash': m.y += m.s * dt; m.x += (2 + Math.sin(t + m.ph) * 3) * dt; break;
        case 'snow': m.y += (m.s + 4) * dt; m.x += (6 + Math.sin(t * 0.8 + m.ph) * 6) * dt; break;
        case 'spores': m.y -= m.s * 0.3 * dt; m.x += Math.sin(t * 0.7 + m.ph) * 4 * dt; break;
        case 'embers': m.y -= m.s * 1.5 * dt; m.x += Math.sin(t * 1.3 + m.ph) * 6 * dt; break;
        case 'dust': m.y += Math.sin(t * 0.5 + m.ph) * 2 * dt; m.x += (1.5 + Math.sin(t * 0.3 + m.ph)) * dt; break;
        case 'debris': m.x -= m.s * 0.5 * dt; m.y += Math.sin(t * 0.4 + m.ph) * 1.5 * dt; break;
      }
      if (m.y > this.H) { m.y = -2; m.x = Math.random() * this.W; }
      if (m.y < -2) { m.y = this.H; m.x = Math.random() * this.W; }
      if (m.x > this.W) m.x = 0;
      if (m.x < 0) m.x = this.W;
      const big = m.s > 9;
      const twinkle = !glows || Math.sin(t * 2 + m.ph * 3) > -0.2;
      if (!twinkle) continue;
      ctx.fillStyle = this.tintCss[big ? 1 : 0];
      const sz = kind === 'snow' && big ? 2 : kind === 'debris' && big ? 2 : 1;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), sz, sz);
      if (glows) { g.fillStyle = this.tintCss[2]; g.fillRect(Math.round(m.x), Math.round(m.y), 1, 1); }
    }
  }
}

function makeFog(W: number, col: RGB) {
  const c = makeCanvas(W * 2, 28), id = new ImageData(W * 2, 28), d = id.data;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < W * 2; x++) {
      const n = fbm((x % W) / 40, y / 9, 3) * (1 - Math.abs(y - 14) / 14);
      const q = Math.round(n * 4 + bayer(x, y) * 1.2) / 4;
      const j = (y * W * 2 + x) * 4;
      d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = Math.max(0, q - 0.25) * 150;
    }
  }
  c.getContext('2d')!.putImageData(id, 0, 0);
  return c;
}
