import { describe, expect, it } from 'vitest';
import { parseDesign, serializeDesign } from '../src/lib/designFile.ts';

const PACKAGE_LOGO = 'over the hill Livery Templates Assets Package/art of rally Sponsors/Oil_Logo.png';
const known = new Set([PACKAGE_LOGO]);
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

function design(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    carId: 'Protector',
    name: 'Crew',
    look: { zones: { body: { variant: 2 } }, wheels: 0 },
    objects: [
      { type: 'Rect', fill: '#ff0000', id: 'a' },
      { type: 'IText', text: 'HI', fill: '#ffffff', id: 'b' },
      { type: 'Image', assetId: 'logo', src: 'blob:stale', id: 'c' },
    ],
    assets: { logo: { kind: 'package', path: PACKAGE_LOGO, name: 'Oil' } },
    ...overrides,
  };
}

describe('parseDesign', () => {
  it('round-trips a design file', () => {
    const parsed = parseDesign(JSON.stringify(design()), known);
    expect(parsed.name).toBe('Crew');
    expect(parsed.design.objects).toHaveLength(3);
    const again = parseDesign(serializeDesign(parsed), known);
    expect(again).toEqual(parsed);
  });

  it('drops image sources so restored images always come from the asset list', () => {
    const image = parseDesign(JSON.stringify(design()), known).design.objects.find((o) => o.type === 'Image');
    expect(image).not.toHaveProperty('src');
  });

  it('rejects files that are not designs', () => {
    expect(() => parseDesign('not json', known)).toThrow(/kein gültiges Design/);
    expect(() => parseDesign(JSON.stringify(design({ version: 2 })), known)).toThrow(/kein Livery-Garage-Design/);
    expect(() => parseDesign(JSON.stringify(design({ objects: 'nope' })), known)).toThrow(/unvollständig/);
  });

  it('cannot be used to load anything from the network', () => {
    const parsed = parseDesign(
      JSON.stringify(
        design({
          objects: [
            { type: 'Image', assetId: 'remote', id: 'x' },
            { type: 'Image', assetId: 'svg', id: 'y' },
            { type: 'Rect', fill: { type: 'pattern', source: 'https://example.com/track.png' }, id: 'z' },
            { type: 'Group', objects: [], id: 'g' },
            { type: 'Image', assetId: 'unknownPath', id: 'u' },
            { type: 'Image', assetId: 'upload', id: 'ok' },
          ],
          assets: {
            remote: { kind: 'upload', dataUrl: 'https://example.com/a.png', name: 'a' },
            svg: { kind: 'upload', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', name: 'b' },
            unknownPath: { kind: 'package', path: '../../etc/passwd', name: 'c' },
            upload: { kind: 'upload', dataUrl: PNG_DATA_URL, name: 'd' },
          },
        }),
      ),
      known,
    );
    expect(parsed.design.objects.map((o) => o.id)).toEqual(['ok']);
    expect(Object.keys(parsed.design.assets)).toEqual(['upload']);
  });

  it('keeps valid patterns and repairs or drops broken paint settings', () => {
    const parsed = parseDesign(
      JSON.stringify(
        design({
          look: {
            zones: {
              body: { variant: 1, pattern: { kind: 'digital', colors: ['#111111', '#222222', '#333333', '#444444'], scale: 5, seed: 8 } },
              roof: { variant: -3, color: 'url(https://example.com)', pattern: { kind: 'unknown' } },
              second: 'nonsense',
            },
            wheels: 2.7,
          },
        }),
      ),
      known,
    );
    expect(parsed.design.look).toEqual({
      zones: {
        body: { variant: 1, pattern: { kind: 'digital', colors: ['#111111', '#222222', '#333333', '#444444'], scale: 2, seed: 8 } },
        roof: { variant: 0 },
      },
      wheels: 2,
    });
  });

  it('accepts flame layers with a gradient fill but not image patterns', () => {
    const gradient = { type: 'linear', coords: { x1: 0, y1: 0, x2: 1, y2: 0 }, colorStops: [{ offset: 0, color: '#ffd23f' }] };
    const parsed = parseDesign(
      JSON.stringify(
        design({
          objects: [
            { type: 'Path', path: [['M', 0, 0], ['L', 10, 0], ['Z']], fill: gradient, kind: 'flames', id: 'flames' },
            { type: 'Path', path: [['M', 0, 0]], fill: { type: 'pattern', source: 'https://example.com/a.png' }, id: 'pattern' },
            { type: 'Path', path: [['M', 0, 0]], fill: { ...gradient, source: 'https://example.com/a.png' }, id: 'sneaky' },
          ],
        }),
      ),
      known,
    );
    expect(parsed.design.objects.map((o) => o.id)).toEqual(['flames']);
  });

  it('accepts sticker groups and rejects groups that are not stickers', () => {
    const badge = [{ type: 'Circle', fill: '#ffffff', stroke: '#000000' }, { type: 'Text', text: '7', fill: '#000000' }];
    const spec = { style: 'circle', text: '7', fontFamily: 'Archivo Black', background: '#ffffff', color: '#000000', outline: '#000000', outlineWidth: 10 };
    const parsed = parseDesign(
      JSON.stringify(
        design({
          objects: [
            { type: 'Group', kind: 'sticker', stickerSpec: spec, objects: badge, id: 'sticker' },
            { type: 'Group', kind: 'sticker', objects: badge, id: 'no-spec' },
            { type: 'Group', kind: 'sticker', stickerSpec: spec, objects: [{ type: 'Image', src: 'https://example.com/a.png' }], id: 'image-inside' },
            { type: 'Group', stickerSpec: spec, objects: badge, id: 'not-a-sticker' },
          ],
        }),
      ),
      known,
    );
    expect(parsed.design.objects.map((o) => o.id)).toEqual(['sticker']);
  });

  it('keeps weathering, clamped', () => {
    const parsed = parseDesign(JSON.stringify(design({ look: { zones: {}, wheels: 0, weathering: { rust: 3, scratches: 0.4, seed: 77 } } })), known);
    expect(parsed.design.look.weathering).toEqual({ rust: 1, scratches: 0.4, seed: 77 });
  });
});
