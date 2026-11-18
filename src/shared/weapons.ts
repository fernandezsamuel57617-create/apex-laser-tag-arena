export type WeaponId =
  | 'pulse_carbine'
  | 'twin_smg'
  | 'scatter_shotgun'
  | 'rail_sniper';

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  category: string;
  description: string;
  price: number;
  damage: number;
  critDamage: number;
  fireCooldownMs: number;
  boostedCooldownMs: number;
  maxAmmo: number;
  reloadDurationMs: number;
  pellets: number;
  spreadRad: number;
  adsFov: number;
  beamRadius: number;
  range: number;
}

export const WEAPONS: WeaponDefinition[] = [
  {
    id: 'pulse_carbine',
    name: 'Carabina de Pulso',
    category: 'Asalto Equilibrado',
    description:
      'Rifle láser versátil de precisión media con cadencia estable y recarga rápida.',
    price: 0,
    damage: 34,
    critDamage: 50,
    fireCooldownMs: 230,
    boostedCooldownMs: 135,
    maxAmmo: 12,
    reloadDurationMs: 1450,
    pellets: 1,
    spreadRad: 0,
    adsFov: 54,
    beamRadius: 0.032,
    range: 130,
  },
  {
    id: 'twin_smg',
    name: 'Subfusil Dual Láser',
    category: 'Alta Cadencia',
    description:
      'Chasis compacto de doble cañón que dispara ráfagas ultrarrápidas con cargador ampliado.',
    price: 220,
    damage: 20,
    critDamage: 30,
    fireCooldownMs: 115,
    boostedCooldownMs: 75,
    maxAmmo: 24,
    reloadDurationMs: 1350,
    pellets: 1,
    spreadRad: 0.016,
    adsFov: 58,
    beamRadius: 0.024,
    range: 95,
  },
  {
    id: 'scatter_shotgun',
    name: 'Escopeta Prisma',
    category: 'Corto Alcance · 5 Haces',
    description:
      'Dispara un abanico de 5 haces de plasma simultáneos letales en duelos cercanos.',
    price: 350,
    damage: 18,
    critDamage: 26,
    fireCooldownMs: 620,
    boostedCooldownMs: 420,
    maxAmmo: 6,
    reloadDurationMs: 1650,
    pellets: 5,
    spreadRad: 0.068,
    adsFov: 60,
    beamRadius: 0.022,
    range: 65,
  },
  {
    id: 'rail_sniper',
    name: 'Rifle Francotirador Rail',
    category: 'Precisión Letal',
    description:
      'Cañón electromagnético largo con mira telescópica de zoom profundo y daño crítico masivo.',
    price: 500,
    damage: 68,
    critDamage: 105,
    fireCooldownMs: 780,
    boostedCooldownMs: 520,
    maxAmmo: 5,
    reloadDurationMs: 1750,
    pellets: 1,
    spreadRad: 0,
    adsFov: 38,
    beamRadius: 0.052,
    range: 160,
  },
];

export const VALID_WEAPON_IDS: WeaponId[] = WEAPONS.map((w) => w.id);

export function isValidWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && VALID_WEAPON_IDS.includes(value as WeaponId);
}

export function getWeaponById(id: string | undefined | null): WeaponDefinition {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}
