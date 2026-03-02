// Upgrade pickup definitions
// These are per-run stat boosts that drop from enemies and props

export const UPGRADE_DEFS = {
  damage_boost: {
    name: 'DAMAGE UP',
    color: '#e94560',
    rarity: 'common',
    apply(state) {
      const combat = state.ecs.get(state.playerId, 'combat');
      if (combat) combat.damage *= 1.2;
    }
  },
  speed_boost: {
    name: 'SPEED UP',
    color: '#f59e0b',
    rarity: 'common',
    apply(state) {
      const player = state.ecs.get(state.playerId, 'player');
      if (player) player.speed *= 1.15;
    }
  },
  combo_extend: {
    name: 'COMBO+',
    color: '#4af',
    rarity: 'uncommon',
    apply(state) {
      const combat = state.ecs.get(state.playerId, 'combat');
      if (combat) combat.comboMax = (combat.comboMax || 3) + 1;
    }
  },
  durability_up: {
    name: 'DURABILITY UP',
    color: '#f80',
    rarity: 'rare',
    apply(state) {
      const combat = state.ecs.get(state.playerId, 'combat');
      if (combat) combat.durabilityMult = (combat.durabilityMult || 1) * 1.5;
    }
  },
  iframe_extend: {
    name: 'DASH+',
    color: '#a855f7',
    rarity: 'rare',
    apply(state) {
      const player = state.ecs.get(state.playerId, 'player');
      if (player) player.dashDuration += 0.05;
    }
  },
  double_dash: {
    name: 'DOUBLE DASH',
    color: '#00d2ff',
    rarity: 'rare',
    apply(state) {
      const player = state.ecs.get(state.playerId, 'player');
      if (player) player.dashCooldown = Math.max(0.1, player.dashCooldown * 0.5);
    }
  },
  max_hp_up: {
    name: 'MAX HP UP',
    color: '#4f4',
    rarity: 'uncommon',
    apply(state) {
      const health = state.ecs.get(state.playerId, 'health');
      if (health) { health.max += 25; health.current += 25; }
    }
  },
  flashlight: {
    name: 'FLASHLIGHT',
    color: '#ffe066',
    rarity: 'fixed',  // never randomly dropped — placed in rooms only
    apply(state) {
      const player = state.ecs.get(state.playerId, 'player');
      if (player) player.hasFlashlight = true;
    }
  },
};

const COMMON_POOL = Object.entries(UPGRADE_DEFS)
  .filter(([, d]) => d.rarity === 'common')
  .map(([k]) => k);

const UNCOMMON_POOL = Object.entries(UPGRADE_DEFS)
  .filter(([, d]) => d.rarity === 'uncommon')
  .map(([k]) => k);

const RARE_POOL = Object.entries(UPGRADE_DEFS)
  .filter(([, d]) => d.rarity === 'rare')
  .map(([k]) => k);

// Roll a random upgrade type based on rarity weights
export function rollUpgrade() {
  const roll = Math.random();
  let pool;
  if (roll < 0.1) {
    pool = RARE_POOL;
  } else if (roll < 0.35) {
    pool = UNCOMMON_POOL;
  } else {
    pool = COMMON_POOL;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// Create an upgrade pickup entity
export function createUpgradePickup(ecs, x, y, upgradeType) {
  const def = UPGRADE_DEFS[upgradeType];
  if (!def) return null;

  const id = ecs.create();
  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'pickup', {
    type: 'upgrade',
    upgradeType,
    def,
    bobOffset: Math.random() * Math.PI * 2,
  });
  ecs.tag(id, 'pickup');
  return id;
}

// Create a health pickup entity
export function createHealthPickup(ecs, x, y, healAmount = 25) {
  const id = ecs.create();
  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'pickup', {
    type: 'health',
    healAmount,
    bobOffset: Math.random() * Math.PI * 2,
  });
  ecs.tag(id, 'pickup');
  return id;
}
