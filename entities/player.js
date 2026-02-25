export function createPlayer(ecs, x, y) {
  const id = ecs.create();

  ecs.add(id, 'position', { x, y });
  ecs.add(id, 'velocity', { x: 0, y: 0 });
  ecs.add(id, 'collider', { w: 12, h: 12, offsetX: -6, offsetY: -6 });
  ecs.add(id, 'player', {
    state: 'idle',
    stateTimer: 0,
    facingX: 1,  // -1, 0, or 1
    facingY: 0,  // -1, 0, or 1
    facingDirX: 1,  // normalized direction
    facingDirY: 0,
    speed: 80,
    // Dash
    dashSpeed: 250,
    dashDuration: 0.15,
    dashCooldown: 0.4,
    dashTimer: 0,
    dashCooldownTimer: 0,
    dashDirX: 0,
    dashDirY: 0,
    invincible: false,
    // Combat
    comboStep: 0,
    comboTimer: 0,
    comboWindow: 0.4,
    attackTimer: 0,
    attackDuration: 0,
    recoveryTimer: 0,
    // Grab/throw
    grabbedEntity: null,
  });
  ecs.add(id, 'health', { current: 100, max: 100 });
  ecs.add(id, 'combat', {
    damage: 1.0,
    weapon: null,
    activeHitbox: null,
  });
  ecs.tag(id, 'player');
  ecs.tag(id, 'hittable');

  return id;
}
