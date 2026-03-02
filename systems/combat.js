import { Physics } from '../engine/physics.js';
import { WEAPON_DEFS } from '../entities/weapons.js';
import { spawnHitEffect } from '../engine/hit-effects.js';

const ATTACKS = {
  light_1: { damage: 10, hitW: 12, hitH: 10, windup: 0, active: 0.15, recovery: 0.1 },
  light_2: { damage: 12, hitW: 14, hitH: 10, windup: 0, active: 0.15, recovery: 0.1 },
  light_3: { damage: 18, hitW: 16, hitH: 12, windup: 0, active: 0.2, recovery: 0.15 },
  light_4: { damage: 22, hitW: 18, hitH: 14, windup: 0, active: 0.2, recovery: 0.2 },
  heavy:   { damage: 30, hitW: 20, hitH: 14, windup: 0.3, active: 0.2, recovery: 0.25 },
};

export class CombatSystem {
  constructor() {
    this.activeHitboxes = []; // { x, y, w, h, damage, owner, hitEntities, knockback, type }
  }

  update(dt, state) {
    const { ecs, input } = state;
    if (!ecs || !input) return;

    // Clear previous frame's hit events (juice reads them before this runs)
    state.hitEvents = [];

    // Process player attacks
    const players = ecs.queryTag('player');
    for (const id of players) {
      const pos = ecs.get(id, 'position');
      const combat = ecs.get(id, 'combat');
      if (pos && combat) this.checkPickups(id, pos, combat, ecs, state);
      this.updatePlayerCombat(dt, id, ecs, input, state);
    }

    // Update thrown enemy projectiles
    this.updateThrownEntities(dt, state);

    // Update thrown weapon projectiles (beaker, etc.)
    this.updateProjectiles(dt, state);

    // Check hitboxes against hittable entities
    this.processHitboxes(dt, state);

    // Age and remove expired hitboxes
    this.cleanupHitboxes(dt);
  }

  updatePlayerCombat(dt, id, ecs, input, state) {
    const player = ecs.get(id, 'player');
    const pos = ecs.get(id, 'position');
    const vel = ecs.get(id, 'velocity');
    const combat = ecs.get(id, 'combat');
    if (!player || !pos || !vel || !combat) return;

    // Can't attack while dashing, hurt, or dead
    if (player.state === 'dash' || player.state === 'hurt' || player.state === 'dead') {
      return;
    }

    // --- Grab/Throw ---
    if (player.state === 'grab') {
      this.updateGrab(dt, id, player, pos, vel, ecs, input, state);
      return;
    }

    if (player.state === 'throw') {
      player.stateTimer -= dt;
      vel.x = 0;
      vel.y = 0;
      if (player.stateTimer <= 0) {
        player.state = 'idle';
      }
      return;
    }

    // Handle active attack states
    if (player.state.startsWith('attack_') || player.state === 'attack_windup') {
      // currentAttack can be nulled mid-frame by hit processing — bail out
      if (!player.currentAttack) {
        player.state = 'idle';
        player.attackPhase = null;
        player.comboStep = 0;
        return;
      }
      player.attackTimer -= dt;

      // Windup phase
      if (player.attackPhase === 'windup') {
        vel.x = 0;
        vel.y = 0;
        if (player.attackTimer <= 0) {
          player.attackPhase = 'active';
          player.attackTimer = player.currentAttack.active;
          this.spawnHitbox(id, pos, player, combat, state);
        }
        return;
      }

      // Active phase
      if (player.attackPhase === 'active') {
        // Slight forward lunge in facing direction
        vel.x = player.facingDirX * 30;
        vel.y = player.facingDirY * 30;
        if (player.attackTimer <= 0) {
          player.attackPhase = 'recovery';
          player.attackTimer = player.currentAttack.recovery;
          vel.x = 0;
        }
        return;
      }

      // Recovery phase — grab can cancel recovery
      if (player.attackPhase === 'recovery') {
        vel.x = 0;
        vel.y = 0;
        if (input.pressed('grab')) {
          player.state = 'idle';
          player.attackPhase = null;
          player.currentAttack = null;
          player.comboStep = 0;
          this.tryGrab(id, player, pos, ecs, state);
          return;
        }
        if (player.attackTimer <= 0) {
          // Start combo window
          player.comboTimer = player.comboWindow;
          player.state = 'idle';
          player.attackPhase = null;
          player.currentAttack = null;
        }
        return;
      }
    }

    // Combo timer countdown (in idle/run states)
    if (player.comboTimer > 0) {
      player.comboTimer -= dt;
      if (player.comboTimer <= 0) {
        player.comboStep = 0;
      }
    }

    // Pickup weapon
    if (input.pressed('interact')) {
      this.tryPickupWeapon(id, pos, combat, ecs, state);
    }

    // Start attack on input
    if (input.pressed('grab')) {
      this.tryGrab(id, player, pos, ecs, state);
    } else if (input.pressed('attack')) {
      this.startLightAttack(player, vel, combat);
    } else if (input.pressed('heavy')) {
      if (combat?.weapon?.throwable) {
        this.throwWeapon(id, player, pos, vel, combat, ecs, state);
      } else {
        this.startHeavyAttack(player, vel, combat, pos, state);
      }
    }
  }

  startLightAttack(player, vel, combat) {
    const weapon = combat ? combat.weapon : null;
    const comboMax = weapon ? weapon.comboMax : 3;
    const speedMult = weapon ? weapon.speedMult : 1;
    const step = player.comboStep;

    let attackName;
    if (step === 0) attackName = 'light_1';
    else if (step === 1) attackName = 'light_2';
    else if (step === 2) attackName = 'light_3';
    else attackName = 'light_4';

    const atk = ATTACKS[attackName];
    if (!atk) return;
    player.state = 'attack_' + attackName;
    player.currentAttack = atk;
    player.comboStep = (step + 1) % comboMax;
    player.comboTimer = 0;
    vel.x = 0;
    vel.y = 0;

    const windup = atk.windup / speedMult;
    const active = atk.active / speedMult;

    if (windup > 0) {
      player.attackPhase = 'windup';
      player.attackTimer = windup;
    } else {
      player.attackPhase = 'active';
      player.attackTimer = active;
      player._spawnHitboxNextFrame = true;
    }
  }

  startHeavyAttack(player, vel, combat, pos, state) {
    const weapon = combat ? combat.weapon : null;
    const speedMult = weapon ? weapon.speedMult : 1;
    const atk = ATTACKS.heavy;
    player.state = 'attack_heavy';
    player.currentAttack = atk;
    player.comboStep = 0;
    player.comboTimer = 0;
    vel.x = 0;
    vel.y = 0;
    player.attackPhase = 'windup';
    player.attackTimer = atk.windup / speedMult;

    // Charge-up particles: spawn at a ring around player, converge inward
    if (state && state.particles && pos) {
      const ring = 18;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const ox = Math.cos(a) * ring;
        const oy = Math.sin(a) * ring;
        state.particles.emit({
          x: pos.x + ox, y: pos.y + oy,
          count: 1,
          speedMin: 70, speedMax: 90,
          angle: a + Math.PI,
          spread: 0.3,
          colors: ['#f80', '#fc0', '#fff'],
          life: 0.2,
          sizeMin: 1, sizeMax: 2,
        });
      }
    }

    // Camera micro-pull in facing direction
    if (state && state.camera) {
      state.camera.punch(player.facingDirX, player.facingDirY, 3);
    }
  }

  spawnHitbox(ownerId, pos, player, combat, state) {
    const atk = player.currentAttack;
    if (!atk) return;

    // Apply weapon modifiers
    const weapon = combat.weapon;
    const dmgMult = weapon ? weapon.damageMult : 1;
    const rangeMult = weapon ? weapon.range : 1;
    const hitW = Math.round(atk.hitW * rangeMult);
    const hitH = Math.round(atk.hitH * rangeMult);

    // Spawn hitbox in facing direction (supports up/down/diagonal)
    const dx = player.facingDirX;
    const dy = player.facingDirY;
    const offset = hitW / 2 + 4;
    const hx = pos.x + dx * offset - hitW / 2;
    const hy = pos.y + dy * offset - hitH / 2;

    const knockbackForce = player.state === 'attack_heavy' ? 200 :
                           player.state === 'attack_light_3' || player.state === 'attack_light_4' ? 150 : 80;

    this.activeHitboxes.push({
      x: hx,
      y: hy,
      w: hitW,
      h: hitH,
      damage: atk.damage * combat.damage * dmgMult,
      owner: ownerId,
      hitEntities: new Set(),
      knockbackX: dx * knockbackForce,
      knockbackY: dy * knockbackForce,
      type: player.state,
      lifetime: atk.active,
      statusEffect: weapon ? weapon.statusEffect : null,
      damageType: weapon ? weapon.damageType : 'blunt',
    });

    // Decrease weapon durability
    if (weapon) {
      weapon.durability--;
      if (weapon.durability <= 0) {
        this.breakWeapon(combat, pos, state);
      }
    }
  }

  breakWeapon(combat, pos, state) {
    const weapon = combat.weapon;
    if (!weapon) return;

    // Particle burst
    if (state && state.particles) {
      state.particles.emit({
        x: pos.x, y: pos.y,
        count: 12,
        speedMin: 30, speedMax: 100,
        colors: [weapon.color, '#fff', '#888'],
        life: 0.4,
        sizeMin: 1, sizeMax: 3,
        gravity: 80,
      });
    }

    combat.weapon = null;
  }

  checkPickups(playerId, pos, combat, ecs, state) {
    // Auto-collect pickups on proximity
    const pickups = [...ecs.queryTag('pickup')];
    for (const pid of pickups) {
      const pickup = ecs.get(pid, 'pickup');
      if (!pickup) continue;
      const ppos = ecs.get(pid, 'position');
      if (!ppos) continue;
      const d = Physics.distance(pos.x, pos.y, ppos.x, ppos.y);
      if (d > 14) continue;

      if (pickup.type === 'health') {
        const health = ecs.get(playerId, 'health');
        if (health && health.current < health.max) {
          health.current = Math.min(health.max, health.current + (pickup.healAmount || 25));
          ecs.destroy(pid);
          if (state.audio) state.audio.playPickup();
          if (state.particles) {
            state.particles.emit({
              x: pos.x, y: pos.y,
              count: 6, speedMin: 20, speedMax: 50,
              colors: ['#4f4', '#8f8', '#fff'],
              life: 0.3, sizeMin: 1, sizeMax: 2,
            });
          }
        }
      } else if (pickup.type === 'upgrade') {
        // Apply upgrade and show popup
        if (pickup.def && pickup.def.apply) {
          pickup.def.apply(state);
        }
        ecs.destroy(pid);
        if (state.audio) state.audio.playUpgrade();
        if (state.hud) {
          state.hud.addPopup(pickup.def.name, pos.x, pos.y - 10, pickup.def.color);
        }
        if (state.particles) {
          state.particles.emit({
            x: pos.x, y: pos.y,
            count: 10, speedMin: 30, speedMax: 70,
            colors: [pickup.def.color, '#fff'],
            life: 0.4, sizeMin: 1, sizeMax: 3,
          });
        }
      }
    }
  }

  tryPickupWeapon(playerId, pos, combat, ecs, state) {
    const pickups = ecs.queryTag('pickup');
    let closest = null;
    let closestDist = 20;

    for (const pid of pickups) {
      const pickup = ecs.get(pid, 'pickup');
      if (!pickup || pickup.type !== 'weapon') continue;
      const ppos = ecs.get(pid, 'position');
      if (!ppos) continue;
      const d = Physics.distance(pos.x, pos.y, ppos.x, ppos.y);
      if (d < closestDist) {
        closest = pid;
        closestDist = d;
      }
    }

    if (closest !== null) {
      const pickup = ecs.get(closest, 'pickup');
      const def = WEAPON_DEFS[pickup.weaponType];
      if (def) {
        combat.weapon = { type: pickup.weaponType, ...def, durability: def.durability, maxDurability: def.durability };
        if (state.hud) state.hud.showWeaponPickup(def);
      }
      ecs.destroy(closest);
      if (state.audio) state.audio.playPickup();

      // Pickup particles
      if (state.particles) {
        state.particles.emit({
          x: pos.x, y: pos.y,
          count: 8,
          speedMin: 20, speedMax: 60,
          colors: ['#fff', '#ff0'],
          life: 0.3,
          sizeMin: 1, sizeMax: 2,
        });
      }
    }
  }

  tryGrab(playerId, player, pos, ecs, state) {
    // Find nearest stunned enemy within grab range
    const enemies = ecs.queryTag('enemy');
    let closest = null;
    let closestDist = 30; // grab range

    for (const eid of enemies) {
      const ai = ecs.get(eid, 'ai');
      if (!ai || ai.state !== 'hurt') continue;
      const epos = ecs.get(eid, 'position');
      if (!epos) continue;
      const d = Physics.distance(pos.x, pos.y, epos.x, epos.y);
      if (d < closestDist) {
        closest = eid;
        closestDist = d;
      }
    }

    if (closest !== null) {
      player.state = 'grab';
      player.grabbedEntity = closest;
      // Freeze grabbed enemy
      const ai = ecs.get(closest, 'ai');
      if (ai) ai.state = 'grabbed';
      const vel = ecs.get(closest, 'velocity');
      if (vel) { vel.x = 0; vel.y = 0; }
    }
  }

  updateGrab(dt, playerId, player, pos, vel, ecs, input, state) {
    const grabbed = player.grabbedEntity;

    // Check if grabbed entity still exists
    if (grabbed === null || !ecs.entities.has(grabbed)) {
      player.state = 'idle';
      player.grabbedEntity = null;
      return;
    }

    // Held entity follows player
    const epos = ecs.get(grabbed, 'position');
    if (epos) {
      epos.x = pos.x + player.facingDirX * 14;
      epos.y = pos.y + player.facingDirY * 14;
    }

    // Movement while grabbing (slower)
    const axis = input.getAxis();
    vel.x = axis.x * player.speed * 0.5;
    vel.y = axis.y * player.speed * 0.5;
    if (axis.x !== 0) player.facingX = axis.x > 0 ? 1 : -1;

    // Throw on attack or grab press
    if (input.pressed('attack') || input.pressed('grab') || input.pressed('heavy')) {
      this.throwEnemy(playerId, player, pos, grabbed, ecs, state);
    }
  }

  throwWeapon(playerId, player, pos, vel, combat, ecs, state) {
    const weapon = combat.weapon;
    const dx = player.facingDirX;
    const dy = player.facingDirY;

    // Spawn projectile entity
    const pid = ecs.create();
    ecs.add(pid, 'position', { x: pos.x + dx * 12, y: pos.y + dy * 12 });
    ecs.add(pid, 'velocity', { x: dx * 220, y: dy * 220 });
    ecs.add(pid, 'collider', { offsetX: -4, offsetY: -4, w: 8, h: 8 });
    ecs.add(pid, 'projectile', {
      weaponType: weapon.type,
      throwType: weapon.throwType || null,
      owner: playerId,
      damage: ATTACKS.heavy.damage * (combat.damage || 1) * weapon.damageMult,
      radius: 28,
      statusEffect: weapon.statusEffect || null,
      lifetime: 2.5,
    });
    ecs.tag(pid, 'projectile');

    // Consume the weapon
    combat.weapon = null;

    // Brief throw animation
    player.state = 'attack_heavy';
    player.attackPhase = 'active';
    player.attackTimer = 0.25;
    player._spawnHitboxNextFrame = false;
    vel.x = 0;
    vel.y = 0;
  }

  updateProjectiles(dt, state) {
    const { ecs, tilemap, particles } = state;
    // queryTag returns a live Set — collect to array first to allow mutation during iteration
    const projectiles = [...ecs.queryTag('projectile')];

    for (const id of projectiles) {
      const proj = ecs.get(id, 'projectile');
      const pos = ecs.get(id, 'position');
      const vel = ecs.get(id, 'velocity');
      const col = ecs.get(id, 'collider');
      if (!proj || !pos || !vel || !col) continue;

      proj.lifetime -= dt;

      // Move
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;

      let explode = proj.lifetime <= 0;

      // Wall collision
      if (!explode && tilemap && col) {
        const box = { x: pos.x + col.offsetX, y: pos.y + col.offsetY, w: col.w, h: col.h };
        const solids = tilemap.getSolidRectsInArea(box.x, box.y, box.w, box.h);
        for (const solid of solids) {
          if (Physics.aabb(box, solid)) { explode = true; break; }
        }
      }

      // Enemy collision
      if (!explode) {
        const enemies = ecs.queryTag('enemy');
        for (const eid of enemies) {
          const epos = ecs.get(eid, 'position');
          const ecol = ecs.get(eid, 'collider');
          const eai = ecs.get(eid, 'ai');
          if (!epos || !ecol || !eai || eai.state === 'dead') continue;
          const box = { x: pos.x + col.offsetX, y: pos.y + col.offsetY, w: col.w, h: col.h };
          const ebox = { x: epos.x + ecol.offsetX, y: epos.y + ecol.offsetY, w: ecol.w, h: ecol.h };
          if (Physics.aabb(box, ebox)) { explode = true; break; }
        }
      }

      if (explode) {
        this.explodeProjectile(id, proj, pos, ecs, state);
      }
    }
  }

  explodeProjectile(id, proj, pos, ecs, state) {
    const { particles } = state;
    const r = proj.radius;
    const isAcid = proj.weaponType === 'beaker';
    const isExtinguisher = proj.throwType === 'extinguisher';

    // Extinguisher uses a wider blast radius for freeze + fire extinguish
    const blastRadius = isExtinguisher ? 40 : r;

    // Hitbox centered on explosion, hits all enemies in radius
    const explosionHitbox = {
      x: pos.x - blastRadius, y: pos.y - blastRadius, w: blastRadius * 2, h: blastRadius * 2,
      damage: proj.damage,
      type: 'explosion',
      damageType: isAcid ? 'sharp' : 'blunt',
      statusEffect: proj.statusEffect,
      knockbackX: 0,
      knockbackY: -80,
      owner: proj.owner,
      hitEntities: new Set(),
    };

    const enemies = ecs.queryTag('enemy');
    for (const eid of enemies) {
      const epos = ecs.get(eid, 'position');
      const ecol = ecs.get(eid, 'collider');
      const eai = ecs.get(eid, 'ai');
      if (!epos || !ecol || !eai || eai.state === 'dead') continue;
      const ebox = { x: epos.x + ecol.offsetX, y: epos.y + ecol.offsetY, w: ecol.w, h: ecol.h };
      if (Physics.aabb(explosionHitbox, ebox)) {
        this.onHit(eid, explosionHitbox, state);
      }
    }

    // Visual effects based on weapon type
    if (isExtinguisher) {
      // Freeze blast — extinguish nearby fire and spawn frost particles
      if (state.fireSystem) {
        state.fireSystem.extinguishNear(pos.x, pos.y, 50);
      }
      spawnHitEffect('hit_heavy', pos.x, pos.y);
      if (particles) {
        // Frost burst — white/cyan particles radiating outward
        particles.emit({
          x: pos.x, y: pos.y, count: 25,
          speedMin: 50, speedMax: 140,
          colors: ['#fff', '#cef', '#8df', '#4cf', '#aef'],
          life: 0.5, sizeMin: 1, sizeMax: 3,
          spread: Math.PI * 2,
        });
        // Secondary frost mist — slower, larger
        particles.emit({
          x: pos.x, y: pos.y, count: 10,
          speedMin: 15, speedMax: 40,
          colors: ['#cef', '#fff'],
          life: 0.6, sizeMin: 2, sizeMax: 4,
          spread: Math.PI * 2,
        });
      }
    } else if (isAcid) {
      spawnHitEffect('hit_burn', pos.x, pos.y);
      if (particles) {
        particles.emit({
          x: pos.x, y: pos.y, count: 22,
          speedMin: 40, speedMax: 130,
          colors: ['#8f8', '#4d4', '#0f0', '#aff', '#fff'],
          life: 0.5, sizeMin: 1, sizeMax: 3,
        });
      }
    } else {
      spawnHitEffect('hit_heavy', pos.x, pos.y);
      if (particles) {
        particles.emit({
          x: pos.x, y: pos.y, count: 15,
          speedMin: 30, speedMax: 100,
          colors: ['#fff', '#ffd', '#ff8', '#fa8'],
          life: 0.4, sizeMin: 1, sizeMax: 3,
        });
      }
    }

    if (state.camera) state.camera.shake(4, 0.3);
    ecs.destroy(id);
  }

  throwEnemy(playerId, player, pos, grabbedId, ecs, state) {
    player.state = 'throw';
    player.stateTimer = 0.2;
    player.grabbedEntity = null;

    const epos = ecs.get(grabbedId, 'position');
    const evel = ecs.get(grabbedId, 'velocity');
    const ai = ecs.get(grabbedId, 'ai');
    const health = ecs.get(grabbedId, 'health');

    if (evel) {
      evel.x = player.facingDirX * 250;
      evel.y = player.facingDirY * 250;
    }

    if (ai) {
      ai.state = 'thrown';
      ai.stateTimer = 0.6; // flight time
    }

    // Tag as thrown projectile
    ecs.tag(grabbedId, 'thrown');
    ecs.add(grabbedId, 'thrown', {
      owner: playerId,
      damage: 20,
      lifetime: 0.6,
      hitEntities: new Set(),
      bounces: 0,
    });

    // Particles
    if (state.particles && epos) {
      state.particles.emit({
        x: epos.x, y: epos.y,
        count: 6,
        speedMin: 20, speedMax: 50,
        colors: ['#fff', '#aaf'],
        life: 0.2,
      });
    }
  }

  updateThrownEntities(dt, state) {
    const { ecs, tilemap, particles } = state;
    const thrown = ecs.queryTag('thrown');

    for (const id of thrown) {
      const td = ecs.get(id, 'thrown');
      const pos = ecs.get(id, 'position');
      const vel = ecs.get(id, 'velocity');
      const col = ecs.get(id, 'collider');
      if (!td || !pos || !vel) continue;

      td.lifetime -= dt;

      // Apply velocity
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;

      // Bounce off walls
      if (tilemap && col) {
        const box = { x: pos.x + col.offsetX, y: pos.y + col.offsetY, w: col.w, h: col.h };
        const solids = tilemap.getSolidRectsInArea(box.x, box.y, box.w, box.h);
        for (const solid of solids) {
          if (Physics.aabb(box, solid)) {
            vel.x *= -0.6;
            vel.y *= -0.6;
            Physics.resolve(box, solid);
            pos.x = box.x - col.offsetX;
            pos.y = box.y - col.offsetY;
            td.bounces++;
            if (particles) {
              particles.emit({
                x: pos.x, y: pos.y, count: 5,
                speedMin: 30, speedMax: 80,
                colors: ['#fff', '#ff8'],
                life: 0.2, sizeMin: 1, sizeMax: 2,
              });
            }
            break;
          }
        }
      }

      // Check collision with other enemies
      const enemies = ecs.queryTag('enemy');
      for (const eid of enemies) {
        if (eid === id) continue;
        if (td.hitEntities.has(eid)) continue;
        const epos = ecs.get(eid, 'position');
        const ecol = ecs.get(eid, 'collider');
        const eai = ecs.get(eid, 'ai');
        if (!epos || !ecol || !eai || eai.state === 'dead') continue;

        const boxA = { x: pos.x + col.offsetX, y: pos.y + col.offsetY, w: col.w, h: col.h };
        const boxB = { x: epos.x + ecol.offsetX, y: epos.y + ecol.offsetY, w: ecol.w, h: ecol.h };

        if (Physics.aabb(boxA, boxB)) {
          td.hitEntities.add(eid);
          // Damage the hit enemy
          this.onHit(eid, {
            damage: td.damage,
            knockbackX: vel.x > 0 ? 120 : -120,
            knockbackY: -30,
            type: 'thrown_enemy',
            owner: td.owner,
            hitEntities: new Set(),
          }, state);
        }
      }

      // Also check collision with player if enemy-owned (shouldn't happen but safe)
      // Expire
      if (td.lifetime <= 0 || td.bounces >= 3) {
        ecs.remove(id, 'thrown');
        if (ecs.tags['thrown']) ecs.tags['thrown'].delete(id);
        const ai = ecs.get(id, 'ai');
        if (ai) {
          ai.state = 'hurt';
          ai.stateTimer = 0.5;
        }
        vel.x *= 0.2;
        vel.y *= 0.2;
      }
    }
  }

  processHitboxes(dt, state) {
    const { ecs } = state;
    const hittables = ecs.queryTag('hittable');

    for (const hb of this.activeHitboxes) {
      for (const targetId of hittables) {
        if (targetId === hb.owner) continue;
        if (hb.hitEntities.has(targetId)) continue;

        // Team check: enemies can't hurt other enemies
        const ownerIsEnemy = ecs.hasTag(hb.owner, 'enemy');
        const targetIsEnemy = ecs.hasTag(targetId, 'enemy');
        if (ownerIsEnemy && targetIsEnemy) continue;

        const pos = ecs.get(targetId, 'position');
        const col = ecs.get(targetId, 'collider');
        if (!pos || !col) continue;

        const targetBox = {
          x: pos.x + col.offsetX,
          y: pos.y + col.offsetY,
          w: col.w,
          h: col.h
        };

        if (Physics.aabb(hb, targetBox)) {
          hb.hitEntities.add(targetId);
          this.onHit(targetId, hb, state);
        }
      }
    }
  }

  onHit(targetId, hitbox, state) {
    const { ecs, particles } = state;
    const health = ecs.get(targetId, 'health');
    const pos = ecs.get(targetId, 'position');
    const vel = ecs.get(targetId, 'velocity');

    // Check player invincibility (dash i-frames)
    const player = ecs.get(targetId, 'player');
    if (player && player.invincible) return;

    // Shield block: riot soldiers block frontal light attacks while actively guarding
    const ai = ecs.get(targetId, 'ai');
    if (ai && ai.hasShield && pos) {
      // Shield only active during chase/idle/patrol/attack states — not while hurt or stunned
      const shieldUp = ai.state === 'chase' || ai.state === 'idle' || ai.state === 'patrol' ||
                        ai.state === 'attack_windup' || ai.state === 'attack_active';
      // Heavy attacks break through the shield
      const isHeavy = hitbox.type === 'attack_heavy' || hitbox.type === 'explosion';
      if (shieldUp && !isHeavy) {
        const ownerPos = ecs.get(hitbox.owner, 'position');
        if (ownerPos) {
          const attackFromX = ownerPos.x - pos.x;
          // Block if attack comes from the direction the enemy is facing
          if ((ai.facingX > 0 && attackFromX > 0) || (ai.facingX < 0 && attackFromX < 0)) {
            // Blocked — small knockback, no damage, spark particles
            if (vel) { vel.x = (attackFromX > 0 ? -1 : 1) * 30; }
            if (pos && particles) {
              particles.emit({
                x: pos.x + (ai.facingX > 0 ? 1 : -1) * 8, y: pos.y,
                count: 5, speedMin: 30, speedMax: 80,
                colors: ['#fff', '#aaf', '#88f'],
                life: 0.2, sizeMin: 1, sizeMax: 2,
              });
            }
            if (state.audio) state.audio.playShieldBlock();
            return; // Attack fully blocked
          }
        }
      }
    }

    let damage = hitbox.damage;

    // Armor: mech soldiers take 50% from light attacks
    if (ai && ai.armored && hitbox.type && hitbox.type.startsWith('attack_light')) {
      damage = Math.floor(damage * 0.5);
    }
    // Bosses take 25% reduced damage from light attacks
    if (ai && ai.isBoss && hitbox.type && hitbox.type.startsWith('attack_light')) {
      damage = Math.floor(damage * 0.75);
    }

    if (health) {
      health.current -= damage;
    }

    // Knockback — explosions push radially outward from center
    if (vel) {
      if (hitbox.type === 'explosion' && pos) {
        const cx = hitbox.x + hitbox.w / 2;
        const cy = hitbox.y + hitbox.h / 2;
        const dir = Physics.direction(cx, cy, pos.x, pos.y);
        vel.x = dir.x * 180;
        vel.y = dir.y * 180 - 40;
      } else {
        vel.x = hitbox.knockbackX;
        vel.y = hitbox.knockbackY;
      }
    }

    // Set player to hurt state
    if (player) {
      if (health && health.current <= 0) {
        player.state = 'dead';
        state.timeScale = 0.3; // Dramatic slow-mo
        if (state.camera) state.camera.shake(10, 0.6);
        if (state.audio) state.audio.playDeath();
      } else {
        player.state = 'hurt';
        player.stateTimer = 0.3;
        player.attackPhase = null;
        player.currentAttack = null;
        player.comboStep = 0;
      }
    }

    // Set enemy to hurt state if it has ai component
    if (ai) {
      // Getting hit cancels alert and marks as alerted
      if (!ai._alerted) ai._alerted = true;
      if (health && health.current <= 0) {
        ai.state = 'dead';
        ai.stateTimer = 0.5;
      } else {
        ai.state = 'hurt';
        ai.stateTimer = 0.6; // Long enough to allow grab
      }
      // Apply status effect from weapon
      if (hitbox.statusEffect && health && health.current > 0) {
        const fx = hitbox.statusEffect;
        ai.status = {
          type: fx.type,
          timer: fx.duration,
          tickDamage: fx.tickDamage || 0,
          tickTimer: 0.5,
        };
        // Stun overrides hurt timer — enemy stays frozen longer
        if (fx.type === 'stun') {
          ai.stateTimer = Math.max(ai.stateTimer, fx.duration);
        }
      }
      // Sharp weapons cause bleed
      if (hitbox.damageType === 'sharp' && health && health.current > 0) {
        ai.bleed = { timer: 3.0, tickTimer: 0.4, tickDamage: 3 };
      }
    }

    // Hit sound
    if (state.audio) {
      if (hitbox.type === 'attack_heavy' || hitbox.type === 'explosion') state.audio.playHeavyHit();
      else state.audio.playHit();
    }

    // Hit particles — blood for sharp, sparks for blunt
    if (pos && particles) {
      const isHeavy = hitbox.type === 'attack_heavy';
      const isExplosion = hitbox.type === 'explosion';
      const isSharp = hitbox.damageType === 'sharp';
      // Explosion hits radiate outward from center; regular hits use knockback direction
      const hitAngle = isExplosion
        ? Math.atan2(pos.y - (hitbox.y + hitbox.h / 2), pos.x - (hitbox.x + hitbox.w / 2))
        : Math.atan2(hitbox.knockbackY || 0, hitbox.knockbackX || 0);
      if (isSharp) {
        // Blood pool on floor
        if (state.bloodPools) {
          state.bloodPools.add(pos.x + (Math.random() - 0.5) * 6, pos.y + (Math.random() - 0.5) * 4, isHeavy || isExplosion ? 6 : 4);
        }
        // Blood splash
        particles.emit({
          x: pos.x, y: pos.y,
          count: isHeavy || isExplosion ? 18 : 10,
          speedMin: 40, speedMax: isHeavy || isExplosion ? 160 : 100,
          colors: ['#c00', '#900', '#f22', '#800'],
          life: isHeavy || isExplosion ? 0.5 : 0.35,
          sizeMin: 1, sizeMax: isHeavy || isExplosion ? 3 : 2,
          angle: hitAngle,
          spread: isExplosion ? Math.PI * 2 : 1.4,
          gravity: 120,
        });
        // Blood droplets (slower, bigger, fall down)
        particles.emit({
          x: pos.x, y: pos.y,
          count: isHeavy || isExplosion ? 6 : 3,
          speedMin: 15, speedMax: 50,
          colors: ['#a00', '#700'],
          life: 0.6,
          sizeMin: 2, sizeMax: 3,
          gravity: 200,
          spread: Math.PI * 2,
        });
      } else {
        // Spark particles (blunt)
        particles.emit({
          x: pos.x, y: pos.y,
          count: isHeavy || isExplosion ? 15 : 8,
          speedMin: 30, speedMax: isHeavy || isExplosion ? 150 : 80,
          colors: isExplosion ? ['#f80', '#ff0', '#fff'] : ['#fff', '#ffd', '#ff8'],
          life: isHeavy || isExplosion ? 0.4 : 0.25,
          sizeMin: 1, sizeMax: isHeavy || isExplosion ? 3 : 2,
          angle: hitAngle,
          spread: isExplosion ? Math.PI * 2 : 1.2,
        });
      }
    }

    // Store hit info for juice system
    if (!state.hitEvents) state.hitEvents = [];
    state.hitEvents.push({
      targetId,
      hitbox,
      position: pos ? { x: pos.x, y: pos.y } : null,
    });
  }

  cleanupHitboxes(dt) {
    for (let i = this.activeHitboxes.length - 1; i >= 0; i--) {
      this.activeHitboxes[i].lifetime -= dt;
      if (this.activeHitboxes[i].lifetime <= 0) {
        this.activeHitboxes.splice(i, 1);
      }
    }
  }
}
