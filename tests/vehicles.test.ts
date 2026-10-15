import { describe, expect, it } from 'vitest';
import { VEHICLE_TAGS, vehicleForTemplate } from '../src/lib/vehicles.ts';

describe('vehicleForTemplate', () => {
  it.each([
    ['BlastWagon_skin.psd', 'BlastWagon', 'Blast Wagon'],
    ['BullV1_skin.psd', 'Bull', 'Bull'],
    ['DingDing_skin.psd', 'Ding', 'Ding'],
    ['GrandWoodman_skin.psd', 'GrandWoodman', 'Grand Woodman'],
    ['RustOx_skin.psd', 'RustOx', 'Rust Ox'],
    ['Timberbox.psd', 'TimberBox', 'Timber Box'],
    ['TrailRat_skin.psd', 'Trailrat', 'Trailrat'],
    ['over the hill Livery Templates Assets Package/Protector_skin.psd', 'Protector', 'Protector'],
  ])('maps %s to car %s (tag %s)', (file, carId, tag) => {
    expect(vehicleForTemplate(file)).toEqual({ carId, tag, known: true });
  });

  it('derives the manifest id from the tag by removing spaces', () => {
    for (const tag of VEHICLE_TAGS) {
      expect(vehicleForTemplate(`${tag.replace(/\s+/g, '')}_skin.psd`).carId).toBe(tag.replace(/\s+/g, ''));
    }
  });

  it('keeps cars it does not know, flagged as unknown', () => {
    expect(vehicleForTemplate('Moonbuggy_skin.psd')).toEqual({ carId: 'Moonbuggy', tag: 'Moonbuggy', known: false });
  });
});
