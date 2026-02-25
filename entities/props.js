import { WEAPON_DEFS } from './weapons.js';

export const PROP_DEFS = {
  desk: {
    name: 'Desk',
    hp: 10,
    w: 16, h: 10,
    color: '#8b6914',
    debris: ['#8b6914', '#a07830', '#6b5010'],
    drops: ['weapon'],
    solid: true,
  },
  monitor: {
    name: 'Monitor',
    hp: 5,
    w: 8, h: 8,
    color: '#556',
    debris: ['#556', '#88f', '#fff'],
    drops: [],
    solid: false,
  },
  glass_wall: {
    name: 'Glass',
    hp: 3,
    w: 4, h: 16,
    color: 'rgba(150,200,255,0.4)',
    debris: ['#adf', '#cef', '#fff'],
    drops: [],
    solid: true,
  },
  barrel: {
    name: 'Barrel',
    hp: 8,
    w: 10, h: 10,
    color: '#c33',
    debris: ['#c33', '#f80', '#ff0'],
    drops: [],
    solid: true,
    explosive: true,
    explosionDamage: 30,
    explosionRadius: 40,
  },
  vending: {
    name: 'Vending Machine',
    hp: 15,
    w: 12, h: 14,
    color: '#3a8',
    debris: ['#3a8', '#888', '#fff'],
    drops: ['health'],
    solid: true,
  },
};

const WEAPON_TYPES = Object.keys(WEAPON_DEFS);

export function createProp(ecs, x, y, propType) {
  const def = PROP_DEFS[propType];
  if (!def) return null;

  const id = ecs.create();
  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', {
    w: def.w, h: def.h,
    offsetX: -def.w / 2, offsetY: -def.h / 2,
  });
  ecs.add(id, 'health', { current: def.hp, max: def.hp });
  ecs.add(id, 'prop', {
    type: propType,
    def,
    destroyed: false,
  });
  ecs.tag(id, 'hittable');
  ecs.tag(id, 'prop');

  // Add to tilemap solid if applicable (done externally)
  return id;
}
