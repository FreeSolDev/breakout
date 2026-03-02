import { Physics } from '../engine/physics.js';

const FIRE_RADIUS = 12;     // overlap detection radius
const FIRE_DURATION = 8;    // seconds before fire expires
const FIRE_DMG = 4;         // damage per tick
const FIRE_DMG_INTERVAL = 0.5; // seconds between damage ticks

export class FireSystem {
  constructor() {
    this.fires = [];
    this._time = 0;
  }

  spawnFire(x, y) {
    this.fires.push({
      x,
      y,
      timer: FIRE_DURATION,
      flickerSeed: Math.random() * Math.PI * 2,
      // Per-entity damage cooldowns so each fire independently ticks damage
      dmgCooldowns: new Map(),
    });
  }

  update(dt, state) {
    if (this.fires.length === 0) {
      if (state.lighting) state.lighting.fireLights = null;
      return;
    }
    this._time += dt;

    const { ecs } = state;

    // Feed fire positions to lighting system for dynamic glow
    if (state.lighting) {
      const lights = [];
      for (const fire of this.fires) {
        const fadeIn = Math.min(1, (FIRE_DURATION - fire.timer + 0.3) / 0.3);
        const fadeOut = Math.min(1, fire.timer / 1.0);
        const alpha = fadeIn * fadeOut;
        const flicker = 0.85 + 0.15 * Math.sin(this._time * 8 + fire.flickerSeed);
        lights.push({ x: fire.x, y: fire.y, intensity: alpha * flicker });
      }
      state.lighting.fireLights = lights;
    }
    const players = ecs.queryTag('player');
    const enemies = ecs.queryTag('enemy');

    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      fire.timer -= dt;
      if (fire.timer <= 0) {
        this.fires.splice(i, 1);
        continue;
      }

      // Damage players
      for (const pid of players) {
        this._tryDamage(fire, pid, dt, ecs, state);
      }

      // Damage enemies
      for (const eid of enemies) {
        const ai = ecs.get(eid, 'ai');
        if (ai && ai.state === 'dead') continue;
        this._tryDamage(fire, eid, dt, ecs, state);
      }
    }
  }

  _tryDamage(fire, entityId, dt, ecs, state) {
    const pos = ecs.get(entityId, 'position');
    if (!pos) return;

    const d = Physics.distance(fire.x, fire.y, pos.x, pos.y);
    if (d > FIRE_RADIUS) {
      // Out of range — reset cooldown so re-entry takes damage immediately
      fire.dmgCooldowns.delete(entityId);
      return;
    }

    // Tick cooldown
    let cd = fire.dmgCooldowns.get(entityId) || 0;
    cd -= dt;
    if (cd <= 0) {
      // Apply damage
      const health = ecs.get(entityId, 'health');
      if (health && health.current > 0) {
        health.current -= FIRE_DMG;

        // Knockback: small push away from fire center
        const vel = ecs.get(entityId, 'velocity');
        if (vel) {
          const dir = Physics.direction(fire.x, fire.y, pos.x, pos.y);
          vel.x += dir.x * 30;
          vel.y += dir.y * 30;
        }

        // Player hurt state
        const player = ecs.get(entityId, 'player');
        if (player && player.state !== 'hurt' && player.state !== 'dead' && player.state !== 'dash') {
          if (health.current <= 0) {
            player.state = 'dead';
            state.timeScale = 0.3;
            if (state.camera) state.camera.shake(10, 0.6);
            if (state.audio) state.audio.playDeath();
          } else {
            player.state = 'hurt';
            player.stateTimer = 0.2;
            player.attackPhase = null;
            player.currentAttack = null;
            player.comboStep = 0;
          }
        }

        // Enemy hurt/dead state
        const ai = ecs.get(entityId, 'ai');
        if (ai && ai.state !== 'dead') {
          if (health.current <= 0) {
            ai.state = 'dead';
            ai.stateTimer = 0.5;
          } else if (ai.state !== 'hurt') {
            ai.state = 'hurt';
            ai.stateTimer = 0.3;
          }
        }

        // Fire damage particles
        if (state.particles) {
          state.particles.emit({
            x: pos.x, y: pos.y,
            count: 3,
            speedMin: 20, speedMax: 50,
            colors: ['#f80', '#ff0', '#f44'],
            life: 0.2,
            sizeMin: 1, sizeMax: 2,
            gravity: -30,
          });
        }
      }
      cd = FIRE_DMG_INTERVAL;
    }
    fire.dmgCooldowns.set(entityId, cd);
  }

  render(ctx) {
    if (this.fires.length === 0) return;
    const t = this._time;

    for (const fire of this.fires) {
      const fadeIn = Math.min(1, (FIRE_DURATION - fire.timer + 0.3) / 0.3);
      const fadeOut = Math.min(1, fire.timer / 1.0);
      const alpha = fadeIn * fadeOut;
      const s = fire.flickerSeed;

      // Base glow
      ctx.globalAlpha = alpha * 0.15;
      ctx.fillStyle = '#f80';
      const glowR = 10 + Math.sin(t * 6 + s) * 2;
      ctx.fillRect(fire.x - glowR, fire.y - glowR, glowR * 2, glowR * 2);

      // Layer 1: outer red flame
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = '#c22';
      const r1 = 5 + Math.sin(t * 8 + s) * 1.5;
      const oy1 = Math.sin(t * 5 + s + 1) * 1.5;
      ctx.fillRect(Math.round(fire.x - r1), Math.round(fire.y - r1 + oy1), Math.round(r1 * 2), Math.round(r1 * 2));

      // Layer 2: orange core
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = '#f80';
      const r2 = 3.5 + Math.sin(t * 10 + s + 2) * 1;
      const oy2 = Math.sin(t * 7 + s + 3) * 1;
      ctx.fillRect(Math.round(fire.x - r2), Math.round(fire.y - r2 + oy2), Math.round(r2 * 2), Math.round(r2 * 2));

      // Layer 3: yellow-white tip
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#ff0';
      const r3 = 2 + Math.sin(t * 12 + s + 4) * 0.8;
      const oy3 = Math.sin(t * 9 + s + 5) * 0.8 - 1;
      ctx.fillRect(Math.round(fire.x - r3), Math.round(fire.y - r3 + oy3), Math.round(r3 * 2), Math.round(r3 * 2));

      // Occasional bright spark pixel
      if (Math.sin(t * 15 + s) > 0.7) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff';
        const sx = fire.x + Math.sin(t * 11 + s) * 3;
        const sy = fire.y - 3 + Math.sin(t * 13 + s) * 2;
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  extinguishNear(x, y, radius) {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      const d = Physics.distance(x, y, fire.x, fire.y);
      if (d < radius) {
        this.fires.splice(i, 1);
      }
    }
  }

  clear() {
    this.fires = [];
  }
}
