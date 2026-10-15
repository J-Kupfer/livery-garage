import { describe, expect, it } from 'vitest';
import { classifyLayer } from '../src/lib/templateLayers.ts';

// Layer names (bottom to top) of every PSD in the template package from 2026-10-12.
const PACKAGE_LAYERS: Record<string, string[]> = {
  BlastWagon: ['base', 'extra', 'wheels', 'lights', 'colour1', 'colour2', 'colourr3', 'colourr4', 'colourr5', '2ndcolour', 'windows', 'uv'],
  Boar: ['base', 'extra', 'lights', 'colour1', 'colour2', 'colour3', 'colour4 ', 'colour5', 'windows', 'uv'],
  Brick: ['base', 'wheels', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', 'extra', 'lights', 'windows', 'uv'],
  BullV1: ['base', 'colour1', 'colour2', 'colour23', 'colour4', 'colour5', 'colour6', '2ndcolour1', '2ndcolour2', 'wheels1', 'wheels2', 'extra', 'lights', 'windows', 'uv'],
  Burro: ['base', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', '2ndcolour1', '2ndcolour2', 'wheels1', 'wheels2', 'extra', 'lights', 'windows', 'uv'],
  Cumbre: ['base', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', '2ndcolour', 'wheel', 'extra', 'lights', 'windows', 'uv'],
  DingDing: ['base', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', '2ndcolour1', '2ndcolour2', 'wheels1', 'wheels2', 'extra', 'lights', 'windows', 'uv'],
  GrandWoodman: ['base', 'colour1', 'colour2', 'colou3', 'colour4', 'colour5', 'extra', 'extra', 'wood', 'wheel', 'lights', 'windows', 'uv'],
  Lynx: ['base', 'extra', 'lights', 'wheels', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', 'colour7', 'colour8', 'colour9', 'roofcolour1', 'windows', 'uv'],
  Mammoth: ['Layer 2', 'wheels', 'colour', 'colour2', 'colour3', 'colou4', 'colou5', 'extra', 'windows', 'lights', 'uv'],
  Marshal: ['base', 'extra', 'lights', 'wheels', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', 'colour7', 'colour8', 'roofcolour1', 'windows', 'uv'],
  Polyana: ['base', 'extra', 'lights', 'wheels', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', 'windows', 'uv'],
  Protector: ['base', 'extra', 'lights', 'wheels', 'wheels2', 'wheels3', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', 'roofcolour1', 'roofcolour2', 'windows', 'uv'],
  Roamer: ['base', 'lights', 'wheels', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', 'colour7', 'extra2', 'extra', 'windows', 'uv'],
  RustOx: ['base', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'roofcolour1', 'extra', 'lights', 'wheels', 'windows', 'uv'],
  Timberbox: ['Base', 'extra', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'wood1', 'wood2', 'window', 'lights', 'uv'],
  Tinny: ['base', 'extra', 'lights', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'metal parts', 'roofcolour1', 'windows', 'uv'],
  TrailBurner: ['base', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', '2ndcolour1', '2ndcolour2', 'wheel1', 'wheel2', 'extra', 'lights', 'windows', 'uv'],
  TrailRat: ['base', 'extra', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', '2ndcolour1', 'wheels1', 'lights', 'windows', 'uv'],
  Wombat: ['base', 'lights', 'wheels', 'colour1', 'colour2', 'colour3', 'colour4', 'colour5', 'colour6', 'extra', 'windows', 'uv'],
  Woodman: ['base', 'colour1', 'colour2', 'colou3', 'colour4', 'colour5', 'extra', 'lights', 'windows', 'uv'],
};

const label = (name: string, index: number) => {
  const cls = classifyLayer(name, index);
  return cls.role === 'paint' ? `paint:${cls.zone}` : cls.role;
};

describe('classifyLayer', () => {
  it.each([
    ['colour1', 'paint:body'],
    ['colou3', 'paint:body'],
    ['colourr4', 'paint:body'],
    ['colour23', 'paint:body'],
    ['colour', 'paint:body'],
    ['colour4 ', 'paint:body'],
    ['2ndcolour', 'paint:second'],
    ['2ndcolour2', 'paint:second'],
    ['roofcolour1', 'paint:roof'],
    ['wheel', 'wheels'],
    ['wheels3', 'wheels'],
    ['uv', 'uv'],
    ['extra2', 'detail'],
    ['metal parts', 'detail'],
    ['window', 'detail'],
    ['wood1', 'detail'],
  ])('classifies %j as %s', (name, expected) => {
    expect(label(name, 3)).toBe(expected);
  });

  it('treats a generic name as base only at the bottom of the stack', () => {
    expect(label('Layer 2', 0)).toBe('base');
    expect(label('Layer 2', 4)).toBe('detail');
  });

  it.each(Object.entries(PACKAGE_LAYERS))('understands the %s template', (_car, names) => {
    const labels = names.map(label);
    expect(labels[0]).toBe('base');
    expect(labels.filter((l) => l === 'base')).toHaveLength(1);
    expect(labels.filter((l) => l === 'uv')).toHaveLength(1);
    expect(labels).toContain('paint:body');
    // Every layer the classifier does not know is drawn as-is, so list them explicitly.
    const details = names.filter((_, i) => labels[i] === 'detail').map((n) => n.toLowerCase().replace(/\s+/g, ''));
    for (const detail of details) expect(detail).toMatch(/^(extra\d*|lights|windows?|wood\d*|metalparts)$/);
  });
});
