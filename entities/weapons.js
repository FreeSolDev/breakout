export const WEAPON_DEFS = {
  baton: {
    name: 'Baton',
    desc: 'Fast combo · Durable',
    damageMult: 1.2,
    speedMult: 1.3,
    range: 1.1,
    durability: 15,
    color: '#c8a060',
    comboMax: 4, // extended combo
    damageType: 'blunt',
  },
  pipe: {
    name: 'Pipe',
    desc: 'Long reach · Strong',
    damageMult: 1.5,
    speedMult: 0.9,
    range: 1.3,
    durability: 12,
    color: '#999',
    comboMax: 3,
    damageType: 'blunt',
  },
  fire_extinguisher: {
    name: 'Fire Ext.',
    desc: 'Throw to freeze · Extinguish',
    damageMult: 2.0,
    speedMult: 0.6,
    range: 1.2,
    durability: 8,
    color: '#e33',
    comboMax: 3,
    damageType: 'blunt',
    throwable: true,
    throwType: 'extinguisher',
    statusEffect: { type: 'freeze', duration: 2.0 },
  },
  stun_rod: {
    name: 'Stun Rod',
    desc: 'Stuns enemies on hit',
    damageMult: 1.3,
    speedMult: 1.0,
    range: 1.0,
    durability: 10,
    color: '#4af',
    comboMax: 3,
    damageType: 'blunt',
    statusEffect: { type: 'stun', duration: 1.2 },
  },
  shiv: {
    name: 'Shiv',
    desc: 'Very fast · Bleed',
    damageMult: 1.1,
    speedMult: 1.4,
    range: 0.8,
    durability: 10,
    color: '#ccc',
    comboMax: 5,
    damageType: 'sharp',
  },
  scalpel: {
    name: 'Scalpel',
    desc: 'Precise · Bleed',
    damageMult: 1.4,
    speedMult: 1.2,
    range: 0.9,
    durability: 6,
    color: '#e8e8f0',
    comboMax: 4,
    damageType: 'sharp',
  },
  chair: {
    name: 'Chair',
    desc: 'Heavy smash · Single use',
    damageMult: 3.0,
    speedMult: 0.5,
    range: 1.0,
    durability: 1,
    color: '#8b6914',
    comboMax: 1,
    damageType: 'blunt',
    throwable: true,
  },
  beaker: {
    name: 'Beaker',
    desc: 'Acid burn · Single use',
    damageMult: 1.5,
    speedMult: 1.0,
    range: 1.0,
    durability: 1,
    color: '#8f8',
    comboMax: 1,
    damageType: 'sharp',
    throwable: true,
    statusEffect: { type: 'burn', duration: 3.0, tickDamage: 5 },
  },
};

export function createWeaponPickup(ecs, x, y, weaponType) {
  const def = WEAPON_DEFS[weaponType];
  if (!def) return null;

  const id = ecs.create();
  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'pickup', {
    type: 'weapon',
    weaponType,
    bobOffset: Math.random() * Math.PI * 2,
  });
  ecs.tag(id, 'pickup');
  return id;
}
