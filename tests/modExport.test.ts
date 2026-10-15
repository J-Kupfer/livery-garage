import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildModZip, liveryFileNames, manifestJson, slugify } from '../src/lib/modExport.ts';

describe('manifestJson', () => {
  it('produces the format from the official modding guide', () => {
    expect(JSON.parse(manifestJson([{ carId: 'GrandWoodman', name: 'Sunset Racer' }]))).toEqual({
      liveries: [{ car: 'GrandWoodman', name: 'Sunset Racer', texture: 'grandwoodman.png', icon: 'grandwoodman_preview.png' }],
    });
  });

  it('falls back to the car id when the name is blank', () => {
    expect(JSON.parse(manifestJson([{ carId: 'Brick', name: '   ' }])).liveries[0].name).toBe('Brick');
  });
});

describe('slugify', () => {
  it.each([
    ['Sunset Racer', 'sunset_racer'],
    ['Grüne Hölle Spaß', 'gruene_hoelle_spass'],
    ['Café  Crème!', 'cafe_creme'],
    ['  ', 'livery'],
    ['玉ねぎ', 'livery'],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('buildModZip', () => {
  it('zips manifest and images flat, with the names the manifest points at', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const zip = await JSZip.loadAsync(await (await buildModZip({ carId: 'Protector', name: 'Rally', texture: png, icon: png })).arrayBuffer());
    const files = liveryFileNames('Protector');
    expect(Object.keys(zip.files).sort()).toEqual(['manifest.json', files.icon, files.texture].sort());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.liveries[0]).toMatchObject({ car: 'Protector', texture: files.texture, icon: files.icon });
  });
});
