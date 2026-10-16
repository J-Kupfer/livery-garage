/**
 * Image filters of our own. Fabric keeps the original picture and renders filters on
 * top of it, so a filter can be switched off again and the original is what gets saved.
 */
import { classRegistry, filters } from 'fabric';

type PipelineState = Parameters<filters.BaseFilter<string>['applyTo2d']>[0];

const SHADER = `
precision highp float;
uniform sampler2D uTexture;
varying vec2 vTexCoord;
void main() {
  vec4 color = texture2D(uTexture, vTexCoord);
  float alpha = 1.0 - min(min(color.r, color.g), color.b);
  vec3 rgb = (color.rgb - (1.0 - alpha)) / max(alpha, 0.0001);
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a * alpha);
}
`;

/**
 * Turns a white background transparent, for logos that come as JPEGs on white. Works
 * like "colour to alpha": every pixel loses as much opacity as it has white in it and
 * keeps the colour it would have without the white, so anti-aliased edges blend into
 * any paint without a light fringe. Light colours turn partly transparent, too.
 */
export class WhiteToAlpha extends filters.BaseFilter<'WhiteToAlpha', Record<string, never>> {
  static type = 'WhiteToAlpha';

  static defaults = {};

  static uniformLocations = [];

  getFragmentSource(): string {
    return SHADER;
  }

  isNeutralState(): boolean {
    return false;
  }

  applyTo2d({ imageData: { data } }: PipelineState): void {
    for (let i = 0; i < data.length; i += 4) {
      const alpha = 1 - Math.min(data[i], data[i + 1], data[i + 2]) / 255;
      if (alpha <= 0) {
        data[i + 3] = 0;
        continue;
      }
      const white = 255 * (1 - alpha);
      // Uint8ClampedArray rounds and clamps on its own.
      data[i] = (data[i] - white) / alpha;
      data[i + 1] = (data[i + 1] - white) / alpha;
      data[i + 2] = (data[i + 2] - white) / alpha;
      data[i + 3] *= alpha;
    }
  }

  sendUniformData(): void {
    // No parameters.
  }
}

classRegistry.setClass(WhiteToAlpha);
