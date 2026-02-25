// Hit effect sprite animations
// Each effect is 4 frames at 32×32px, loaded as individual PNGs.

const EFFECTS_BASE = './assets/effects';

const EFFECT_NAMES = [
  'hit_light', 'hit_heavy', 'hit_stun', 'hit_slash',
  'hit_freeze', 'hit_burn', 'hit_electric',
];

const DISPLAY_DURATION = 0.18; // how long a single frame flash stays visible

// effectFrames[name] = [frame0, frame1, frame2, frame3]
const effectFrames = {};

// Active instances: { type, x, y, frameIdx, timer }
const activeEffects = [];

export async function loadHitEffects() {
  const loads = EFFECT_NAMES.flatMap(name => {
    effectFrames[name] = new Array(4).fill(null);
    return [0, 1, 2, 3].map(i =>
      new Promise(resolve => {
        const img = new Image();
        img.onload = () => { effectFrames[name][i] = img; resolve(); };
        img.onerror = resolve;
        img.src = `${EFFECTS_BASE}/${name}_${i}.png`;
      })
    );
  });
  await Promise.all(loads);
}

// Spawn an effect centered at world position (x, y).
// Picks one random frame and displays it as a static flash.
// Skips if an effect is already showing near this position.
export function spawnHitEffect(type, x, y) {
  const frames = effectFrames[type];
  if (!frames) return;
  const validFrames = frames.filter(Boolean);
  if (!validFrames.length) return;
  const DEDUP_RADIUS = 20;
  for (const e of activeEffects) {
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy < DEDUP_RADIUS * DEDUP_RADIUS) return;
  }
  const frameIdx = Math.floor(Math.random() * validFrames.length);
  activeEffects.push({ type, x, y, frameIdx, timer: 0 });
}

// Map a hitbox to an effect type based on damage and attack type string.
export function hitboxToEffectType(hitbox) {
  const t = hitbox?.type || '';
  if (t.includes('heavy') || t === 'thrown_enemy') return 'hit_heavy';
  return 'hit_light';
}

// Clear all active effects immediately.
export function clearHitEffects() {
  activeEffects.length = 0;
}

// Advance all active effects. Call once per update tick.
export function updateHitEffects(dt) {
  for (let i = activeEffects.length - 1; i >= 0; i--) {
    const e = activeEffects[i];
    e.timer += dt;
    if (e.timer >= DISPLAY_DURATION) {
      activeEffects.splice(i, 1);
    }
  }
}

// Draw all active effects. Must be called while the camera transform is active
// on ctx so that world-space coordinates map correctly.
export function drawHitEffects(ctx) {
  for (const e of activeEffects) {
    const img = effectFrames[e.type][e.frameIdx];
    if (!img) continue;
    ctx.drawImage(img,
      Math.round(e.x - img.width / 2),
      Math.round(e.y - img.height / 2)
    );
  }
}
