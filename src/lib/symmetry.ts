/**
 * In every template the two sides of the car lie above and below the roof as mirror
 * images, the upper side upside down. The line between them is the car's centre line
 * on roof and bonnet, and it sits at a different height for every car. It is found
 * from the paint mask: the horizontal line about which the mask matches itself best.
 */

/** The paint mask sampled as a size × size grid: 1 where there is paint. */
export type MaskSampler = (size: number) => Uint8Array;

export interface MirrorAxis {
  /** Texture y of the axis. */
  y: number;
  /** Share of the paint that lands on paint again when mirrored, 0 to 1. */
  score: number;
}

/** Below this share a template does not count as mirrored (the lowest of the 21 cars is 0.72). */
const MIN_SCORE = 0.6;
const COARSE_SIZE = 128;
const FINE_SIZE = 512;

/**
 * Share of the paint that lands on paint again when the mask is mirrored so that row y
 * meets row `sum - y`. Measured against all of the paint, so an axis near the edge, where
 * little of the mask has a partner row at all, scores low.
 */
export function mirrorScore(mask: Uint8Array, size: number, sum: number): number {
  let total = 0;
  let hits = 0;
  for (let y = 0; y < size; y++) {
    const partner = sum - y;
    const inside = partner >= 0 && partner < size;
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue;
      total++;
      if (inside && mask[partner * size + x]) hits++;
    }
  }
  return total ? hits / total : 0;
}

/** Finds the mirror axis, coarse first and then refined; undefined if the paint is not mirrored. */
export function findMirrorAxis(sample: MaskSampler, textureSize: number): MirrorAxis | undefined {
  const coarse = sample(COARSE_SIZE);
  let best = { sum: 0, score: -1 };
  // Axes between an eighth and seven eighths of the height. Rows y and sum - y meet at
  // the pixel edge (sum + 1) / 2.
  for (let sum = COARSE_SIZE / 4 - 1; sum <= (COARSE_SIZE * 7) / 4 - 1; sum++) {
    const score = mirrorScore(coarse, COARSE_SIZE, sum);
    if (score > best.score) best = { sum, score };
  }
  const scale = FINE_SIZE / COARSE_SIZE;
  const fine = sample(FINE_SIZE);
  const around = (best.sum + 1) * scale - 1;
  let top = { sum: around, score: -1 };
  for (let sum = around - scale - 2; sum <= around + scale + 2; sum++) {
    const score = mirrorScore(fine, FINE_SIZE, sum);
    if (score > top.score) top = { sum, score };
  }
  if (top.score < MIN_SCORE) return undefined;
  return { y: ((top.sum + 1) / 2) * (textureSize / FINE_SIZE), score: top.score };
}

export interface Placement {
  /** Centre of the layer. */
  x: number;
  y: number;
  angle: number;
  flipY: boolean;
}

/** Angle in degrees, normalised to -180 (inclusive) to 180 (exclusive). */
const normalized = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180;

/**
 * Where a layer's counterpart goes on the other side of the car: at the mirrored spot.
 * The upper side lies upside down in the texture, so text, numbers and logos are turned
 * by 180° to read correctly on the car. Everything else is mirrored, so flames and
 * stripes point backwards on both sides, as on a real car.
 */
export function otherSide(placement: Placement, axis: number, readable: boolean): Placement {
  const y = 2 * axis - placement.y;
  return readable
    ? { x: placement.x, y, angle: normalized(180 - placement.angle), flipY: placement.flipY }
    : { x: placement.x, y, angle: normalized(-placement.angle), flipY: !placement.flipY };
}
