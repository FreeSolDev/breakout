export function createCommander(ecs, x, y) {
  const id = ecs.create();

  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', { w: 18, h: 18, offsetX: -9, offsetY: -9 });
  ecs.add(id, 'health', { current: 350, max: 350 });
  ecs.add(id, 'ai', {
    type: 'commander',
    state: 'idle',
    stateTimer: 0,
    facingX: 1,
    speed: 45,
    detectionRange: 160,
    attackRange: 28,
    attackDamage: 30,
    attackWindup: 0.45,
    attackActive: 0.2,
    attackRecovery: 0.35,
    attackCooldown: 0.8,
    attackCooldownTimer: 0,
    patrolPointA: { x: x - 50, y },
    patrolPointB: { x: x + 50, y },
    patrolTarget: 'B',
    isBoss: true,
    // Phase system
    phase: 1,
    comboCount: 0,
    comboMax: 3,
    summonTimer: 15,
    introPlayed: false,
  });
  ecs.tag(id, 'enemy');
  ecs.tag(id, 'hittable');

  return id;
}

// The Warden — 400 HP final boss, 3 phases
export function createWarden(ecs, x, y) {
  const id = ecs.create();

  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', { w: 22, h: 22, offsetX: -11, offsetY: -11 });
  ecs.add(id, 'health', { current: 600, max: 600 });
  ecs.add(id, 'ai', {
    type: 'warden',
    state: 'idle',
    stateTimer: 0,
    facingX: 1,
    speed: 40,
    detectionRange: 200,
    attackRange: 30,
    attackDamage: 45,
    attackWindup: 0.5,
    attackActive: 0.25,
    attackRecovery: 0.4,
    attackCooldown: 1.0,
    attackCooldownTimer: 0,
    patrolPointA: { x: x - 60, y },
    patrolPointB: { x: x + 60, y },
    patrolTarget: 'B',
    isBoss: true,
    // Phase system
    phase: 1,
    shootTimer: 2.0,
    shootCooldown: 2.0,
    hazardTimer: 8.0,
    summonTimer: 20,
    introPlayed: false,
  });
  ecs.tag(id, 'enemy');
  ecs.tag(id, 'hittable');

  return id;
}

export function createSecurityGuard(ecs, x, y) {
  const id = ecs.create();

  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', { w: 12, h: 12, offsetX: -6, offsetY: -6 });
  ecs.add(id, 'health', { current: 40, max: 40 });
  ecs.add(id, 'ai', {
    type: 'security_guard',
    state: 'idle',
    stateTimer: 0,
    facingX: 1,
    speed: 50,
    detectionRange: 100,
    attackRange: 20,
    attackDamage: 15,
    attackWindup: 0.4,
    attackActive: 0.15,
    attackRecovery: 0.3,
    attackCooldown: 0.8,
    attackCooldownTimer: 0,
    patrolPointA: { x: x - 30, y },
    patrolPointB: { x: x + 30, y },
    patrolTarget: 'B',
  });
  ecs.tag(id, 'enemy');
  ecs.tag(id, 'hittable');

  return id;
}

// Scientist — 15 HP, runs away, triggers alarm after 3s (spawns 2 guards)
export function createScientist(ecs, x, y) {
  const id = ecs.create();

  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', { w: 10, h: 10, offsetX: -5, offsetY: -5 });
  ecs.add(id, 'health', { current: 15, max: 15 });
  ecs.add(id, 'ai', {
    type: 'scientist',
    state: 'idle',
    stateTimer: 1 + Math.random() * 2,
    facingX: 1,
    speed: 35,
    detectionRange: 80,
    attackRange: 0,
    attackDamage: 0,
    attackWindup: 0, attackActive: 0, attackRecovery: 0,
    attackCooldown: 0, attackCooldownTimer: 0,
    patrolPointA: { x: x - 20, y },
    patrolPointB: { x: x + 20, y },
    patrolTarget: 'B',
    // Scientist-specific
    alarmTimer: 3.0,
    alarmTriggered: false,
  });
  ecs.tag(id, 'enemy');
  ecs.tag(id, 'hittable');

  return id;
}

// Riot Soldier — 60 HP, shield blocks frontal attacks, slow
export function createRiotSoldier(ecs, x, y) {
  const id = ecs.create();

  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', { w: 14, h: 14, offsetX: -7, offsetY: -7 });
  ecs.add(id, 'health', { current: 60, max: 60 });
  ecs.add(id, 'ai', {
    type: 'riot_soldier',
    state: 'idle',
    stateTimer: 0,
    facingX: 1,
    speed: 30,
    detectionRange: 90,
    attackRange: 18,
    attackDamage: 20,
    attackWindup: 0.6,
    attackActive: 0.2,
    attackRecovery: 0.5,
    attackCooldown: 1.2,
    attackCooldownTimer: 0,
    patrolPointA: { x: x - 25, y },
    patrolPointB: { x: x + 25, y },
    patrolTarget: 'B',
    // Shield blocks frontal hits
    hasShield: true,
  });
  ecs.tag(id, 'enemy');
  ecs.tag(id, 'hittable');

  return id;
}

// Lab Mutant — 35 HP, erratic zigzag, lunge attack
export function createLabMutant(ecs, x, y) {
  const id = ecs.create();

  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', { w: 12, h: 12, offsetX: -6, offsetY: -6 });
  ecs.add(id, 'health', { current: 35, max: 35 });
  ecs.add(id, 'ai', {
    type: 'lab_mutant',
    state: 'idle',
    stateTimer: 0,
    facingX: 1,
    speed: 65,
    detectionRange: 110,
    attackRange: 40,
    attackDamage: 18,
    attackWindup: 0.2,
    attackActive: 0.15,
    attackRecovery: 0.4,
    attackCooldown: 0.6,
    attackCooldownTimer: 0,
    patrolPointA: { x: x - 30, y },
    patrolPointB: { x: x + 30, y },
    patrolTarget: 'B',
    // Zigzag offset
    zigzagTimer: 0,
    zigzagDir: 1,
  });
  ecs.tag(id, 'enemy');
  ecs.tag(id, 'hittable');

  return id;
}

// Drone — 25 HP, flies (ignores collision), shoots projectile, retreats
export function createDrone(ecs, x, y) {
  const id = ecs.create();

  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', { w: 10, h: 10, offsetX: -5, offsetY: -5 });
  ecs.add(id, 'health', { current: 25, max: 25 });
  ecs.add(id, 'ai', {
    type: 'drone',
    state: 'idle',
    stateTimer: 0,
    facingX: 1,
    speed: 45,
    detectionRange: 130,
    attackRange: 80,
    attackDamage: 10,
    attackWindup: 0, attackActive: 0, attackRecovery: 0,
    attackCooldown: 2.0,
    attackCooldownTimer: 0,
    patrolPointA: { x: x - 40, y },
    patrolPointB: { x: x + 40, y },
    patrolTarget: 'B',
    // Drone-specific
    shootCooldown: 2.0,
    shootTimer: 1.0 + Math.random(),
    flies: true,
    preferredDist: 60,
  });
  ecs.tag(id, 'enemy');
  ecs.tag(id, 'hittable');

  return id;
}

// Mech Soldier — 100 HP, slow, heavy punch, armored (50% light dmg reduction)
export function createMechSoldier(ecs, x, y) {
  const id = ecs.create();

  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', { w: 16, h: 16, offsetX: -8, offsetY: -8 });
  ecs.add(id, 'health', { current: 100, max: 100 });
  ecs.add(id, 'ai', {
    type: 'mech_soldier',
    state: 'idle',
    stateTimer: 0,
    facingX: 1,
    speed: 30,
    detectionRange: 100,
    attackRange: 22,
    attackDamage: 40,
    attackWindup: 0.7,
    attackActive: 0.25,
    attackRecovery: 0.6,
    attackCooldown: 1.5,
    attackCooldownTimer: 0,
    patrolPointA: { x: x - 25, y },
    patrolPointB: { x: x + 25, y },
    patrolTarget: 'B',
    // Mech-specific
    armored: true, // 50% dmg reduction from light attacks
  });
  ecs.tag(id, 'enemy');
  ecs.tag(id, 'hittable');

  return id;
}

// Factory map for floor generator
export const ENEMY_FACTORIES = {
  security_guard: createSecurityGuard,
  scientist: createScientist,
  riot_soldier: createRiotSoldier,
  lab_mutant: createLabMutant,
  drone: createDrone,
  mech_soldier: createMechSoldier,
  commander: createCommander,
  warden: createWarden,
};
