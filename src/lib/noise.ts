/** Seeded 2D gradient noise for the procedural patterns and weathering. */
import { mulberry32 } from './random.ts';

function grad(hash: number, x: number, y: number): number {
  switch (hash & 7) {
    case 0:
      return x + y;
    case 1:
      return y - x;
    case 2:
      return x - y;
    case 3:
      return -x - y;
    case 4:
      return x;
    case 5:
      return -x;
    case 6:
      return y;
    default:
      return -y;
  }
}

/** Classic 2D gradient noise with a seeded permutation table. */
export class Perlin {
  private readonly perm = new Uint8Array(512);

  constructor(seed: number) {
    const random = mulberry32(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise(x: number, y: number): number {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const xi = fx & 255;
    const yi = fy & 255;
    const xf = x - fx;
    const yf = y - fy;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const p = this.perm;
    const a = p[xi] + yi;
    const b = p[xi + 1] + yi;
    const n00 = grad(p[a], xf, yf);
    const n10 = grad(p[b], xf - 1, yf);
    const n01 = grad(p[a + 1], xf, yf - 1);
    const n11 = grad(p[b + 1], xf - 1, yf - 1);
    const top = n00 + u * (n10 - n00);
    return top + v * (n01 + u * (n11 - n01) - top);
  }

  /** Fractal noise: four octaves, roughly in [-1, 1]. */
  fbm(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let amplitude = 1;
    let norm = 0;
    let frequency = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * this.noise(x * frequency, y * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return sum / norm;
  }
}
