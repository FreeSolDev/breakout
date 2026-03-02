import { loadImage } from './sprites.js';

const BASE = './assets/sprites';
const PICKUP_BASE = './assets/pickups';

const CHAR_TYPES = [
  'player', 'security_guard', 'scientist', 'riot_soldier',
  'lab_mutant', 'drone', 'mech_soldier', 'commander', 'warden',
  'commander_mutated', 'warden_mutated',
  // Boss variants (v1-v6)
  ...Array.from({ length: 6 }, (_, i) => `commander_v${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `commander_mutated_v${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `warden_v${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `warden_mutated_v${i + 1}`),
];
const DIRS = ['south', 'north', 'east', 'west'];

const PICKUP_NAMES = [
  'health_kit',
  'baton', 'pipe', 'fire_extinguisher', 'stun_rod', 'shiv', 'scalpel', 'chair', 'beaker',
  'damage_boost', 'speed_boost', 'combo_extend', 'durability_up', 'iframe_extend', 'double_dash', 'max_hp_up',
  'barrel', 'flashlight',
];

// { type: { south, north, east, west } } — populated by loadAllSprites()
export const sprites = {};

// { name: Image } — pickup/item sprites
export const pickupSprites = {};

export async function loadAllSprites() {
  const charLoads = CHAR_TYPES.flatMap(type => {
    sprites[type] = {};
    return DIRS.map(dir =>
      loadImage(`${BASE}/${type}/${dir}.png`)
        .then(img => { sprites[type][dir] = img; })
        .catch(() => {})
    );
  });
  const pickupLoads = PICKUP_NAMES.map(name =>
    loadImage(`${PICKUP_BASE}/${name}.png`)
      .then(img => { pickupSprites[name] = img; })
      .catch(() => {})
  );
  await Promise.all([...charLoads, ...pickupLoads]);
}

export function facingToDir(fx, fy) {
  if (Math.abs(fx) >= Math.abs(fy)) return fx >= 0 ? 'east' : 'west';
  return fy >= 0 ? 'south' : 'north';
}

// Draw character sprite centered at (cx, cy). Optional scale parameter.
export function drawSprite(ctx, type, fx, fy, cx, cy, scale) {
  const s = sprites[type];
  if (!s) return false;
  const img = s[facingToDir(fx, fy)];
  if (!img) return false;
  if (scale && scale !== 1) {
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
  } else {
    ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(cy - img.height / 2));
  }
  return true;
}

// Draw a pickup sprite centered at (cx, cy). Returns true if drawn.
export function drawPickupSprite(ctx, name, cx, cy, scale = 0.5) {
  const img = pickupSprites[name];
  if (!img) return false;
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
  return true;
}

// Draw equipped weapon sprite next to character at (cx, cy) based on facing direction.
// Drawn at 18×18 scaled to fit near the character's hand.
export function drawEquippedWeapon(ctx, weaponType, fx, fy, cx, cy) {
  const img = pickupSprites[weaponType];
  if (!img) return;
  const dir = facingToDir(fx, fy);
  // Offset the weapon to the character's "hand" position
  const offsets = { east: [10, 2], west: [-10, 2], south: [7, 10], north: [-5, -10] };
  const [ox, oy] = offsets[dir] || [10, 2];
  const size = 18;
  ctx.save();
  if (dir === 'west') {
    // Flip weapon horizontally when facing left
    ctx.translate(Math.round(cx + ox + size / 2), Math.round(cy + oy));
    ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    ctx.drawImage(img, Math.round(cx + ox - size / 2), Math.round(cy + oy - size / 2), size, size);
  }
  ctx.restore();
}
