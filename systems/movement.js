import { Physics } from '../engine/physics.js';

export class MovementSystem {
  update(dt, state) {
    const { ecs, input, tilemap } = state;
    if (!ecs || !input || !tilemap) return;

    const players = ecs.queryTag('player');
    for (const id of players) {
      const pos = ecs.get(id, 'position');
      const vel = ecs.get(id, 'velocity');
      const player = ecs.get(id, 'player');
      const col = ecs.get(id, 'collider');
      if (!pos || !vel || !player || !col) continue;

      this.updateState(dt, input, player, vel, state);
      this.applyMovement(dt, pos, vel, player, col, tilemap);
      this.updateFacing(input, player);
    }
  }

  updateState(dt, input, player, vel, state) {
    // Dash cooldown
    if (player.dashCooldownTimer > 0) {
      player.dashCooldownTimer -= dt;
    }

    // State-specific logic
    switch (player.state) {
      case 'idle':
      case 'run': {
        const axis = input.getAxis();
        if (input.pressed('dash') && player.dashCooldownTimer <= 0) {
          this.startDash(player, axis);
          if (state.audio) state.audio.playDash();
        } else if (axis.x !== 0 || axis.y !== 0) {
          player.state = 'run';
          vel.x = axis.x * player.speed;
          vel.y = axis.y * player.speed;
        } else {
          player.state = 'idle';
          vel.x = 0;
          vel.y = 0;
        }
        break;
      }

      case 'dash': {
        player.dashTimer -= dt;
        if (player.dashTimer <= 0) {
          player.state = 'idle';
          player.invincible = false;
          vel.x = 0;
          vel.y = 0;
        } else {
          vel.x = player.dashDirX * player.dashSpeed;
          vel.y = player.dashDirY * player.dashSpeed;
        }
        break;
      }

      case 'hurt': {
        player.stateTimer -= dt;
        // Friction on knockback
        vel.x *= 0.9;
        vel.y *= 0.9;
        if (player.stateTimer <= 0) {
          player.state = 'idle';
          vel.x = 0;
          vel.y = 0;
        }
        break;
      }

      case 'dead':
        vel.x = 0;
        vel.y = 0;
        break;

      // Attack states handled by combat system
      default:
        break;
    }
  }

  startDash(player, axis) {
    player.state = 'dash';
    player.invincible = true;
    player.dashTimer = player.dashDuration;
    player.dashCooldownTimer = player.dashCooldown;
    // Dash in movement direction, or facing direction if standing still
    if (axis.x !== 0 || axis.y !== 0) {
      player.dashDirX = axis.x;
      player.dashDirY = axis.y;
    } else {
      player.dashDirX = player.facingDirX;
      player.dashDirY = player.facingDirY;
    }
  }

  applyMovement(dt, pos, vel, player, col, tilemap) {
    // Move X, then resolve
    pos.x += vel.x * dt;
    this.resolveCollision(pos, col, tilemap);

    // Move Y, then resolve
    pos.y += vel.y * dt;
    this.resolveCollision(pos, col, tilemap);
  }

  resolveCollision(pos, col, tilemap) {
    const box = {
      x: pos.x + col.offsetX,
      y: pos.y + col.offsetY,
      w: col.w,
      h: col.h
    };
    const solids = tilemap.getSolidRectsInArea(box.x, box.y, box.w, box.h);
    for (const solid of solids) {
      if (Physics.aabb(box, solid)) {
        Physics.resolve(box, solid);
        pos.x = box.x - col.offsetX;
        pos.y = box.y - col.offsetY;
      }
    }
  }

  updateFacing(input, player) {
    if (player.state === 'dash' || player.state === 'hurt' || player.state === 'dead') return;
    if (player.state.startsWith('attack_') || player.state === 'grab' || player.state === 'throw') return;
    const axis = input.getAxis();
    if (axis.x !== 0 || axis.y !== 0) {
      player.facingX = axis.x;  // can be -1, 0, or 1
      player.facingY = axis.y;  // can be -1, 0, or 1
      // Normalize for hitbox direction
      const len = Math.sqrt(axis.x * axis.x + axis.y * axis.y);
      player.facingDirX = axis.x / len;
      player.facingDirY = axis.y / len;
    }
  }
}
