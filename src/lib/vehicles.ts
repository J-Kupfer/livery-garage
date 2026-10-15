/**
 * Vehicle tags of over the hill on mod.io (game 13441), taken from the game's
 * tag options on 2026-10-15. The manifest `car` field is the tag without spaces
 * (matched case-insensitively by the game), and uploads must carry the tag itself.
 */
export const VEHICLE_TAGS = [
  'Blast Wagon',
  'Boar',
  'Brick',
  'Bull',
  'Burro',
  'Cumbre',
  'Ding',
  'Grand Woodman',
  'Lynx',
  'Mammoth',
  'Marshal',
  'Polyana',
  'Protector',
  'Roamer',
  'Rust Ox',
  'Timber Box',
  'Tinny',
  'Trail Burner',
  'Trailrat',
  'Wombat',
  'Woodman',
] as const;

/** Template file names that differ from their vehicle tag. */
const TEMPLATE_ALIASES: Record<string, string> = {
  bullv1: 'Bull',
  dingding: 'Ding',
};

export interface Vehicle {
  /** Human-readable mod.io tag, e.g. "Grand Woodman". */
  tag: string;
  /** Manifest car id, e.g. "GrandWoodman". */
  carId: string;
  /** False when the template is not in the known tag list (e.g. a car added after 2026-10-15). */
  known: boolean;
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Maps a template file name such as "BullV1_skin.psd" to its vehicle. */
export function vehicleForTemplate(fileName: string): Vehicle {
  const stem = fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.psd$/i, '')
    .replace(/_skin$/i, '');
  const key = squash(stem);
  const tag = TEMPLATE_ALIASES[key] ?? VEHICLE_TAGS.find((t) => squash(t) === key);
  if (tag) return { tag, carId: tag.replace(/\s+/g, ''), known: true };
  return { tag: stem, carId: stem.replace(/\s+/g, ''), known: false };
}
