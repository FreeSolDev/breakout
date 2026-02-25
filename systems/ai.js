import { Physics } from '../engine/physics.js';
import { rollUpgrade, createUpgradePickup, createHealthPickup } from '../entities/pickups.js';
import { createSecurityGuard, createRiotSoldier } from '../entities/enemies.js';

export class AISystem {
  update(dt, state) {
    const { ecs, tilemap } = state;
    if (!ecs) return;

    // Find player position
    const players = ecs.queryTag('player');
    if (players.size === 0) return;
    const playerId = players.values().next().value;
    const playerPos = ecs.get(playerId, 'position');
    if (!playerPos) return;

    const enemies = ecs.queryTag('enemy');
    for (const id of enemies) {
      const ai = ecs.get(id, 'ai');
      const pos = ecs.get(id, 'position');
      const vel = ecs.get(id, 'velocity');
      const col = ecs.get(id, 'collider');
      if (!ai || !pos || !vel) continue;

      this.updateEnemy(dt, id, ai, pos, vel, col, playerPos, state);

      // Grabbed/thrown handled by combat system
      if (ai.state === 'grabbed' || ai.state === 'thrown') continue;

      // Apply velocity
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;

      // Apply tilemap collision (drones fly over walls but stay in bounds)
      if (col && tilemap && !ai.flies) {
        this.resolveCollision(pos, col, tilemap);
      } else if (ai.flies && tilemap) {
        // Keep flying entities inside the wall border (1 tile inward from each edge)
        const ts = tilemap.tileSize;
        pos.x = Math.max(ts, Math.min((tilemap.width - 1) * ts, pos.x));
        pos.y = Math.max(ts, Math.min((tilemap.height - 1) * ts, pos.y));
      }

      // Safety net: teleport any living enemy that's out of bounds or inside a wall
      if (tilemap && ai.state !== 'dead') {
        const tx = Math.floor(pos.x / tilemap.tileSize);
        const ty = Math.floor(pos.y / tilemap.tileSize);
        if (tx <= 0 || ty <= 0 || tx >= tilemap.width - 1 || ty >= tilemap.height - 1 ||
            tilemap.isSolid(tx, ty)) {
          this.teleportToSafeTile(pos, vel, tilemap, playerPos);
        }
      }
    }

    // Update projectiles
    this.updateProjectiles(dt, state);

    // Update floor hazards
    this.updateHazards(dt, state);
  }

  updateEnemy(dt, id, ai, pos, vel, col, playerPos, state) {
    // Grabbed/thrown enemies are controlled by combat system
    if (ai.state === 'grabbed' || ai.state === 'thrown') return;

    // Process status effects
    if (ai.status) {
      ai.status.timer -= dt;
      if (ai.status.timer <= 0) {
        ai.status = null;
      } else {
        // Stun: enemy stays in hurt state, can't act
        if (ai.status.type === 'stun') {
          ai.state = 'hurt';
          ai.stateTimer = Math.max(ai.stateTimer, 0.1);
          vel.x *= 0.8;
          vel.y *= 0.8;
          // Electric spark particles
          if (state.particles && Math.random() < 0.3) {
            state.particles.emit({
              x: pos.x + (Math.random() - 0.5) * 10,
              y: pos.y + (Math.random() - 0.5) * 10,
              count: 1, speedMin: 20, speedMax: 60,
              colors: ['#4af', '#fff', '#88f'],
              life: 0.15, sizeMin: 1, sizeMax: 2,
            });
          }
          return; // Skip all AI while stunned
        }
        // Burn: damage over time
        if (ai.status.type === 'burn') {
          ai.status.tickTimer -= dt;
          if (ai.status.tickTimer <= 0) {
            ai.status.tickTimer = 0.5;
            const health = state.ecs.get(id, 'health');
            if (health) {
              health.current -= ai.status.tickDamage;
              if (health.current <= 0) {
                ai.state = 'dead';
                ai.stateTimer = 0.5;
              }
            }
            if (state.particles) {
              state.particles.emit({
                x: pos.x, y: pos.y - 4,
                count: 2, speedMin: 10, speedMax: 30,
                colors: ['#8f8', '#ff0', '#4f4'],
                life: 0.3, sizeMin: 1, sizeMax: 2, gravity: -40,
              });
            }
          }
        }
        // Freeze: half speed
        if (ai.status.type === 'freeze') {
          vel.x *= 0.5;
          vel.y *= 0.5;
        }
      }
    }

    // Process bleed (separate from status — can stack with stun/freeze/burn)
    if (ai.bleed) {
      ai.bleed.timer -= dt;
      if (ai.bleed.timer <= 0) {
        ai.bleed = null;
      } else {
        ai.bleed.tickTimer -= dt;
        if (ai.bleed.tickTimer <= 0) {
          ai.bleed.tickTimer = 0.4;
          const health = state.ecs.get(id, 'health');
          if (health) {
            health.current -= ai.bleed.tickDamage;
            if (health.current <= 0) {
              ai.state = 'dead';
              ai.stateTimer = 0.5;
            }
          }
          // Blood drip particles
          if (state.particles) {
            state.particles.emit({
              x: pos.x + (Math.random() - 0.5) * 6,
              y: pos.y + 4,
              count: 2, speedMin: 5, speedMax: 20,
              colors: ['#c00', '#900', '#700'],
              life: 0.5, sizeMin: 1, sizeMax: 2, gravity: 150,
              spread: 0.8, angle: Math.PI / 2,
            });
          }
          // Blood drip pool on floor
          if (state.bloodPools) {
            state.bloodPools.addDrip(pos.x + (Math.random() - 0.5) * 8, pos.y + 4 + Math.random() * 4);
          }
        }
      }
    }

    const dist = Physics.distance(pos.x, pos.y, playerPos.x, playerPos.y);

    // Cooldown
    if (ai.attackCooldownTimer > 0) ai.attackCooldownTimer -= dt;

    // Type-specific dispatching
    switch (ai.type) {
      case 'scientist':
        this.updateScientist(dt, id, ai, pos, vel, dist, playerPos, state);
        return;
      case 'drone':
        this.updateDrone(dt, id, ai, pos, vel, dist, playerPos, state);
        return;
      case 'lab_mutant':
        this.updateLabMutant(dt, id, ai, pos, vel, dist, playerPos, state);
        return;
      case 'commander':
        this.updateCommander(dt, id, ai, pos, vel, dist, playerPos, state);
        return;
      case 'warden':
        this.updateWarden(dt, id, ai, pos, vel, dist, playerPos, state);
        return;
    }

    // Default AI (security_guard, riot_soldier, mech_soldier)
    const eHealth = state.ecs.get(id, 'health');
    const desperate = eHealth && eHealth.current / eHealth.max < 0.4;

    switch (ai.state) {
      case 'idle':
        vel.x = 0;
        vel.y = 0;
        ai.stateTimer -= dt;
        if (dist < ai.detectionRange) {
          ai.state = 'chase';
        } else if (ai.stateTimer <= 0) {
          ai.state = 'patrol';
        }
        break;

      case 'patrol':
        this.patrol(dt, ai, pos, vel);
        if (dist < ai.detectionRange) {
          ai.state = 'chase';
        }
        break;

      case 'chase':
        if (desperate) {
          // Hit-and-run: retreat + strafe, then dash in to attack
          const away = Physics.direction(playerPos.x, playerPos.y, pos.x, pos.y);
          const strafe = Math.sin(performance.now() * 0.004) * 0.6;
          vel.x = (away.x + (-away.y) * strafe) * ai.speed;
          vel.y = (away.y + away.x * strafe) * ai.speed;
          ai.facingX = playerPos.x > pos.x ? 1 : -1;
          // Dash in when cooldown ready
          if (ai.attackCooldownTimer <= 0 && dist > 16) {
            ai.state = 'attack_windup';
            ai.stateTimer = ai.attackWindup * 0.55;
            const atkDir = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
            ai._attackDir = atkDir;
            ai.facingX = atkDir.x > 0 ? 1 : -1;
            vel.x = 0; vel.y = 0;
          }
        } else {
          this.chase(dt, ai, pos, vel, playerPos);
          if (dist < ai.attackRange && ai.attackCooldownTimer <= 0) {
            ai.state = 'attack_windup';
            ai.stateTimer = ai.attackWindup;
            const atkDir = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
            ai._attackDir = atkDir;
            ai.facingX = atkDir.x > 0 ? 1 : -1;
            vel.x = 0;
            vel.y = 0;
          } else if (dist > ai.detectionRange * 1.5) {
            ai.state = 'idle';
            ai.stateTimer = 1;
          }
        }
        break;

      case 'attack_windup':
        vel.x = 0;
        vel.y = 0;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'attack_active';
          ai.stateTimer = ai.attackActive;
          this.spawnEnemyHitbox(id, pos, ai, state);
        }
        break;

      case 'attack_active': {
        const ad = ai._attackDir || { x: ai.facingX, y: 0 };
        const lungeSpeed = desperate ? 75 : 40;
        vel.x = ad.x * lungeSpeed;
        vel.y = ad.y * lungeSpeed;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'attack_recovery';
          ai.stateTimer = ai.attackRecovery;
          vel.x = 0;
          vel.y = 0;
        }
        break;
      }

      case 'attack_recovery': {
        if (desperate) {
          // Retreat after hitting
          const rDir = Physics.direction(playerPos.x, playerPos.y, pos.x, pos.y);
          vel.x = rDir.x * ai.speed * 0.8;
          vel.y = rDir.y * ai.speed * 0.8;
        } else {
          vel.x = 0;
          vel.y = 0;
        }
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'chase';
          ai.attackCooldownTimer = ai.attackCooldown * (desperate ? 0.55 : 1);
        }
        break;
      }

      case 'hurt':
        vel.x *= 0.88;
        vel.y *= 0.88;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'chase';
        }
        break;

      case 'dead':
        vel.x *= 0.9;
        vel.y *= 0.9;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          this.onDeath(id, pos, state);
        }
        break;
    }
  }

  // ── Scientist: runs away, triggers alarm ──
  updateScientist(dt, id, ai, pos, vel, dist, playerPos, state) {
    switch (ai.state) {
      case 'idle':
      case 'patrol':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (dist < ai.detectionRange) {
          ai.state = 'flee';
          ai.alarmTimer = 3.0;
        } else if (ai.stateTimer <= 0) {
          ai.stateTimer = 2 + Math.random() * 2;
        }
        break;

      case 'flee':
        // Run away from player
        const dir = Physics.direction(playerPos.x, playerPos.y, pos.x, pos.y);
        vel.x = dir.x * ai.speed;
        vel.y = dir.y * ai.speed;
        ai.facingX = dir.x > 0 ? 1 : -1;
        // Alarm countdown
        if (!ai.alarmTriggered) {
          ai.alarmTimer -= dt;
          if (ai.alarmTimer <= 0) {
            ai.alarmTriggered = true;
            // Spawn 2 guards near scientist
            const g1 = createSecurityGuard(state.ecs, pos.x + 20, pos.y);
            const g2 = createSecurityGuard(state.ecs, pos.x - 20, pos.y);
            if (state.floor) { state.floor.spawnedEntityIds.push(g1, g2); }
            if (state.particles) {
              state.particles.emit({
                x: pos.x, y: pos.y - 8,
                count: 8, speedMin: 10, speedMax: 40,
                colors: ['#f44', '#ff0'],
                life: 0.5, sizeMin: 1, sizeMax: 2,
              });
            }
          }
        }
        break;

      case 'hurt':
        vel.x *= 0.88; vel.y *= 0.88;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) ai.state = 'flee';
        break;

      case 'dead':
        vel.x *= 0.9; vel.y *= 0.9;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) this.onDeath(id, pos, state);
        break;
    }
  }

  // ── Drone: flies, retreats, shoots projectiles ──
  updateDrone(dt, id, ai, pos, vel, dist, playerPos, state) {
    switch (ai.state) {
      case 'idle':
      case 'patrol':
        vel.x = 0; vel.y = 0;
        if (dist < ai.detectionRange) {
          ai.state = 'chase';
        }
        break;

      case 'chase': {
        // Maintain preferred distance — retreat if too close, approach if too far
        const dirToPlayer = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
        if (dist < ai.preferredDist - 10) {
          // Too close, retreat
          vel.x = -dirToPlayer.x * ai.speed;
          vel.y = -dirToPlayer.y * ai.speed;
        } else if (dist > ai.preferredDist + 20) {
          // Too far, approach
          vel.x = dirToPlayer.x * ai.speed * 0.7;
          vel.y = dirToPlayer.y * ai.speed * 0.7;
        } else {
          // Strafe perpendicular
          vel.x = -dirToPlayer.y * ai.speed * 0.4;
          vel.y = dirToPlayer.x * ai.speed * 0.4;
        }
        ai.facingX = dirToPlayer.x > 0 ? 1 : -1;

        // Shoot timer
        ai.shootTimer -= dt;
        if (ai.shootTimer <= 0) {
          ai.shootTimer = ai.shootCooldown;
          this.spawnProjectile(pos, playerPos, ai.attackDamage, state);
        }

        if (dist > ai.detectionRange * 1.5) {
          ai.state = 'idle';
        }
        break;
      }

      case 'hurt':
        vel.x *= 0.85; vel.y *= 0.85;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) ai.state = 'chase';
        break;

      case 'dead':
        vel.x *= 0.9; vel.y *= 0.9;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) this.onDeath(id, pos, state);
        break;
    }
  }

  // ── Lab Mutant: zigzag movement, lunge attack ──
  updateLabMutant(dt, id, ai, pos, vel, dist, playerPos, state) {
    switch (ai.state) {
      case 'idle':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (dist < ai.detectionRange) ai.state = 'chase';
        else if (ai.stateTimer <= 0) {
          ai.state = 'patrol';
          ai.stateTimer = 3;
        }
        break;

      case 'patrol':
        this.patrol(dt, ai, pos, vel);
        if (dist < ai.detectionRange) ai.state = 'chase';
        break;

      case 'chase': {
        const dir = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
        // Zigzag perpendicular to movement
        ai.zigzagTimer += dt;
        if (ai.zigzagTimer > 0.3) {
          ai.zigzagTimer = 0;
          ai.zigzagDir *= -1;
        }
        vel.x = dir.x * ai.speed + (-dir.y) * ai.zigzagDir * ai.speed * 0.5;
        vel.y = dir.y * ai.speed + dir.x * ai.zigzagDir * ai.speed * 0.5;
        ai.facingX = dir.x > 0 ? 1 : -1;

        if (dist < ai.attackRange && ai.attackCooldownTimer <= 0) {
          // Lunge attack
          ai.state = 'attack_windup';
          ai.stateTimer = ai.attackWindup;
          ai._lungeDir = { ...dir };
          vel.x = 0; vel.y = 0;
        }
        break;
      }

      case 'attack_windup':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'attack_active';
          ai.stateTimer = ai.attackActive;
          // Fast lunge
          const ld = ai._lungeDir || { x: ai.facingX, y: 0 };
          vel.x = ld.x * 200;
          vel.y = ld.y * 200;
          this.spawnEnemyHitbox(id, pos, ai, state);
        }
        break;

      case 'attack_active':
        ai.stateTimer -= dt;
        vel.x *= 0.95;
        vel.y *= 0.95;
        if (ai.stateTimer <= 0) {
          ai.state = 'attack_recovery';
          ai.stateTimer = ai.attackRecovery;
          vel.x = 0; vel.y = 0;
        }
        break;

      case 'attack_recovery':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'chase';
          ai.attackCooldownTimer = ai.attackCooldown;
        }
        break;

      case 'hurt':
        vel.x *= 0.88; vel.y *= 0.88;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) ai.state = 'chase';
        break;

      case 'dead':
        vel.x *= 0.9; vel.y *= 0.9;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) this.onDeath(id, pos, state);
        break;
    }
  }

  // ── Commander: phase-based mini-boss ──
  updateCommander(dt, id, ai, pos, vel, dist, playerPos, state) {
    const health = state.ecs.get(id, 'health');

    // Phase transition
    if (health && ai.phase === 1 && health.current <= health.max * 0.5) {
      ai.phase = 2;
      ai.speed = 55;
      ai.attackCooldown = 0.7;
      ai.comboMax = 4;
      ai.summonTimer = 10;
      ai.state = 'idle';
      ai.stateTimer = 1;
      vel.x = 0; vel.y = 0;

      // Push player away (clamped to room bounds)
      const ppos = state.ecs.get(state.playerId, 'position');
      if (ppos) {
        const pushDir = Physics.direction(pos.x, pos.y, ppos.x, ppos.y);
        ppos.x += pushDir.x * 55;
        ppos.y += pushDir.y * 55;
        const tm = state.tilemap;
        if (tm) {
          const ts = tm.tileSize;
          ppos.x = Math.max(ts * 2, Math.min((tm.width - 2) * ts, ppos.x));
          ppos.y = Math.max(ts * 2, Math.min((tm.height - 2) * ts, ppos.y));
        }
      }
      if (state.camera) state.camera.shake(5, 0.3);

      // Play rage transformation cutscene
      if (state.cutscene && state._scripts && state._scripts.commander_rage) {
        state.cutscene._rageBossId = id;
        state.cutscene.play(state._scripts.commander_rage, state);
      }
    }

    // Boss intro
    if (!ai.introPlayed && dist < ai.detectionRange) {
      ai.introPlayed = true;
      if (state.hud) state.hud.addPopup('COMMANDER', pos.x, pos.y - 20, '#ff4444');
      if (state.camera) state.camera.shake(4, 0.2);
    }

    // Summon timer
    if (ai.state === 'chase' || ai.state === 'idle') {
      ai.summonTimer -= dt;
      if (ai.summonTimer <= 0) {
        ai.summonTimer = ai.phase === 1 ? 15 : 10;
        // Summon reinforcements
        let s1, s2;
        if (ai.phase === 1) {
          s1 = createSecurityGuard(state.ecs, pos.x + 30, pos.y);
          s2 = createSecurityGuard(state.ecs, pos.x - 30, pos.y);
        } else {
          s1 = createRiotSoldier(state.ecs, pos.x + 30, pos.y);
          s2 = createRiotSoldier(state.ecs, pos.x - 30, pos.y);
        }
        if (state.floor) { state.floor.spawnedEntityIds.push(s1, s2); }
        if (state.particles) {
          state.particles.emit({
            x: pos.x, y: pos.y, count: 10,
            speedMin: 20, speedMax: 60,
            colors: ['#f44', '#f80'],
            life: 0.4, sizeMin: 1, sizeMax: 3,
          });
        }
      }
    }

    switch (ai.state) {
      case 'idle':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (dist < ai.detectionRange) ai.state = 'chase';
        else if (ai.stateTimer <= 0) ai.state = 'patrol';
        break;

      case 'patrol':
        this.patrol(dt, ai, pos, vel);
        if (dist < ai.detectionRange) ai.state = 'chase';
        break;

      case 'chase':
        this.chase(dt, ai, pos, vel, playerPos);
        if (dist < ai.attackRange && ai.attackCooldownTimer <= 0) {
          // Phase 2: chance of dash attack
          if (ai.phase === 2 && dist > 16 && Math.random() < 0.35) {
            ai.state = 'dash_windup';
            ai.stateTimer = 0.3;
            ai._dashDir = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
            vel.x = 0; vel.y = 0;
          } else {
            ai.state = 'attack_windup';
            ai.stateTimer = ai.attackWindup;
            ai.comboCount = 0;
            ai._attackDir = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
            ai.facingX = ai._attackDir.x > 0 ? 1 : -1;
            vel.x = 0; vel.y = 0;
          }
        } else if (dist > ai.detectionRange * 1.5) {
          ai.state = 'idle';
          ai.stateTimer = 1;
        }
        break;

      case 'dash_windup':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'dash_active';
          ai.stateTimer = 0.25;
          const d = ai._dashDir || { x: ai.facingX, y: 0 };
          vel.x = d.x * 250;
          vel.y = d.y * 250;
          this.spawnEnemyHitbox(id, pos, ai, state);
        }
        break;

      case 'dash_active':
        vel.x *= 0.96; vel.y *= 0.96;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'attack_recovery';
          ai.stateTimer = 0.5;
          vel.x = 0; vel.y = 0;
        }
        break;

      case 'attack_windup':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'attack_active';
          ai.stateTimer = ai.attackActive;
          this.spawnEnemyHitbox(id, pos, ai, state);
          ai.comboCount++;
        }
        break;

      case 'attack_active': {
        const cad = ai._attackDir || { x: ai.facingX, y: 0 };
        vel.x = cad.x * 50;
        vel.y = cad.y * 50;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          // Continue combo?
          if (ai.comboCount < ai.comboMax) {
            ai.state = 'attack_windup';
            ai.stateTimer = ai.attackWindup * 0.6; // Faster combo windups
          } else {
            ai.state = 'attack_recovery';
            ai.stateTimer = ai.attackRecovery;
            vel.x = 0;
            vel.y = 0;
          }
        }
        break;
      }

      case 'attack_recovery':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'chase';
          ai.attackCooldownTimer = ai.attackCooldown;
        }
        break;

      case 'hurt':
        vel.x *= 0.88; vel.y *= 0.88;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) ai.state = 'chase';
        break;

      case 'dead':
        vel.x *= 0.9; vel.y *= 0.9;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) this.onDeath(id, pos, state);
        break;
    }
  }

  // ── The Warden: final boss, 3 phases ──
  updateWarden(dt, id, ai, pos, vel, dist, playerPos, state) {
    const health = state.ecs.get(id, 'health');
    const hpPct = health ? health.current / health.max : 1;

    // Phase transitions
    if (ai.phase === 1 && hpPct <= 0.5) {
      ai.phase = 2;
      ai.hazardTimer = 6;
      if (state.hud) state.hud.addPopup('FACILITY LOCKDOWN', pos.x, pos.y - 20, '#f80');
      if (state.camera) state.camera.shake(8, 0.4);
      if (state.particles) {
        state.particles.emit({
          x: pos.x, y: pos.y, count: 25,
          speedMin: 50, speedMax: 140,
          colors: ['#f80', '#ff0', '#fff'],
          life: 0.6, sizeMin: 2, sizeMax: 4,
        });
      }
    } else if (ai.phase === 2 && hpPct <= 0.25) {
      ai.phase = 3;
      ai.speed = 60;
      ai.attackDamage = 50;
      ai.attackWindup = 0.35;
      ai.attackCooldown = 0.5;
      ai.state = 'idle';
      vel.x = 0; vel.y = 0;

      // Push player away (clamped to room bounds)
      const wppos = state.ecs.get(state.playerId, 'position');
      if (wppos) {
        const wPush = Physics.direction(pos.x, pos.y, wppos.x, wppos.y);
        wppos.x += wPush.x * 65;
        wppos.y += wPush.y * 65;
        const tm = state.tilemap;
        if (tm) {
          const ts = tm.tileSize;
          wppos.x = Math.max(ts * 2, Math.min((tm.width - 2) * ts, wppos.x));
          wppos.y = Math.max(ts * 2, Math.min((tm.height - 2) * ts, wppos.y));
        }
      }
      if (state.camera) state.camera.shake(6, 0.3);

      // Play rage transformation cutscene
      if (state.cutscene && state._scripts && state._scripts.warden_rage) {
        state.cutscene._rageBossId = id;
        state.cutscene.play(state._scripts.warden_rage, state);
      }
    }

    // Boss intro
    if (!ai.introPlayed && dist < ai.detectionRange) {
      ai.introPlayed = true;
      if (state.hud) state.hud.addPopup('THE WARDEN', pos.x, pos.y - 24, '#ff4444');
      if (state.camera) state.camera.shake(5, 0.3);
    }

    switch (ai.state) {
      case 'idle':
        vel.x = 0; vel.y = 0;
        if (dist < ai.detectionRange) ai.state = 'chase';
        break;

      case 'chase': {
        // Phase 1: ranged, keeps distance and shoots
        if (ai.phase === 1) {
          const dir = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
          if (dist < 50) {
            // Retreat
            vel.x = -dir.x * ai.speed;
            vel.y = -dir.y * ai.speed;
          } else if (dist > 100) {
            vel.x = dir.x * ai.speed * 0.6;
            vel.y = dir.y * ai.speed * 0.6;
          } else {
            // Strafe
            vel.x = -dir.y * ai.speed * 0.5;
            vel.y = dir.x * ai.speed * 0.5;
          }
          ai.facingX = dir.x > 0 ? 1 : -1;

          ai.shootTimer -= dt;
          if (ai.shootTimer <= 0) {
            ai.shootTimer = ai.shootCooldown;
            // Fire 3-shot burst
            for (let i = -1; i <= 1; i++) {
              const angle = Math.atan2(dir.y, dir.x) + i * 0.2;
              this.spawnProjectileAngle(pos, angle, ai.attackDamage * 0.4, state);
            }
          }
        }
        // Phase 2: ranged + floor hazards
        else if (ai.phase === 2) {
          const dir = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
          if (dist < 40) {
            vel.x = -dir.x * ai.speed;
            vel.y = -dir.y * ai.speed;
          } else {
            vel.x = dir.x * ai.speed * 0.5;
            vel.y = dir.y * ai.speed * 0.5;
          }
          ai.facingX = dir.x > 0 ? 1 : -1;

          ai.shootTimer -= dt;
          if (ai.shootTimer <= 0) {
            ai.shootTimer = ai.shootCooldown * 0.8;
            for (let i = -1; i <= 1; i++) {
              const angle = Math.atan2(dir.y, dir.x) + i * 0.25;
              this.spawnProjectileAngle(pos, angle, ai.attackDamage * 0.35, state);
            }
          }

          // Floor hazards
          ai.hazardTimer -= dt;
          if (ai.hazardTimer <= 0) {
            ai.hazardTimer = 6;
            this.spawnFloorHazard(playerPos, state);
            if (state.camera) state.camera.shake(4, 0.2);
          }
        }
        // Phase 3: aggressive melee
        else if (ai.phase === 3) {
          this.chase(dt, ai, pos, vel, playerPos);
          // Periodic screen shake (facility crumbling)
          ai.hazardTimer -= dt;
          if (ai.hazardTimer <= 0) {
            ai.hazardTimer = 3;
            if (state.camera) state.camera.shake(3, 0.15);
            if (state.particles) {
              // Falling debris
              for (let i = 0; i < 3; i++) {
                state.particles.emit({
                  x: pos.x + (Math.random() - 0.5) * 100,
                  y: pos.y + (Math.random() - 0.5) * 100,
                  count: 4, speedMin: 10, speedMax: 40,
                  colors: ['#888', '#666', '#aaa'],
                  life: 0.5, sizeMin: 1, sizeMax: 3, gravity: 120,
                });
              }
            }
          }

          if (dist < ai.attackRange && ai.attackCooldownTimer <= 0) {
            ai.state = 'attack_windup';
            ai.stateTimer = ai.attackWindup;
            ai._attackDir = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
            ai.facingX = ai._attackDir.x > 0 ? 1 : -1;
            vel.x = 0; vel.y = 0;
          }
        }
        break;
      }

      case 'attack_windup':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'attack_active';
          ai.stateTimer = ai.attackActive;
          this.spawnEnemyHitbox(id, pos, ai, state);
        }
        break;

      case 'attack_active': {
        const wad = ai._attackDir || { x: ai.facingX, y: 0 };
        vel.x = wad.x * 60;
        vel.y = wad.y * 60;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'attack_recovery';
          ai.stateTimer = ai.attackRecovery;
          vel.x = 0;
          vel.y = 0;
        }
        break;
      }

      case 'attack_recovery':
        vel.x = 0; vel.y = 0;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          ai.state = 'chase';
          ai.attackCooldownTimer = ai.attackCooldown;
        }
        break;

      case 'hurt':
        vel.x *= 0.92; vel.y *= 0.92; // Bosses resist knockback more
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) ai.state = 'chase';
        break;

      case 'dead':
        vel.x *= 0.9; vel.y *= 0.9;
        ai.stateTimer -= dt;
        if (ai.stateTimer <= 0) {
          this.onDeath(id, pos, state);
          // Warden death triggers escape cutscene then victory
          if (state.cutscene && state._scripts && state._scripts.escape) {
            state.cutscene.play(state._scripts.escape, state, () => {
              if (state.menus) state.menus.currentMenu = 'victory';
            });
          } else if (state.menus) {
            state.menus.currentMenu = 'victory';
          }
        }
        break;
    }
  }

  spawnProjectileAngle(fromPos, angle, damage, state) {
    if (state.audio) state.audio.playProjectile();
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const id = state.ecs.create();
    state.ecs.add(id, 'position', { x: fromPos.x, y: fromPos.y });
    state.ecs.add(id, 'velocity', { x: dx * 130, y: dy * 130 });
    state.ecs.add(id, 'projectile', {
      damage,
      lifetime: 3.0,
      owner: 'enemy',
    });
    state.ecs.tag(id, 'projectile');
  }

  spawnFloorHazard(targetPos, state) {
    // Spawn a delayed explosion at player's position
    const id = state.ecs.create();
    state.ecs.add(id, 'position', { x: targetPos.x, y: targetPos.y });
    state.ecs.add(id, 'hazard', {
      delay: 1.0,
      radius: 30,
      damage: 25,
      warned: false,
    });
    state.ecs.tag(id, 'hazard');
  }

  // ── Shared behaviors ──

  teleportToSafeTile(pos, vel, tilemap, playerPos) {
    const ts = tilemap.tileSize;
    const candidates = [];
    for (let y = 2; y < tilemap.height - 2; y++) {
      for (let x = 2; x < tilemap.width - 2; x++) {
        if (tilemap.isSolid(x, y)) continue;
        const px = x * ts + ts / 2;
        const py = y * ts + ts / 2;
        // At least 3 tiles from the player
        if (Math.abs(px - playerPos.x) + Math.abs(py - playerPos.y) < ts * 3) continue;
        candidates.push({ x: px, y: py });
      }
    }
    if (candidates.length > 0) {
      const t = candidates[Math.floor(Math.random() * candidates.length)];
      pos.x = t.x;
      pos.y = t.y;
    } else {
      // Fallback: room center
      pos.x = Math.floor(tilemap.width / 2) * ts + ts / 2;
      pos.y = Math.floor(tilemap.height / 2) * ts + ts / 2;
    }
    vel.x = 0;
    vel.y = 0;
  }

  onDeath(id, pos, state) {
    if (state.audio) state.audio.playDeath();
    if (state.particles) {
      state.particles.emit({
        x: pos.x, y: pos.y,
        count: 12,
        speedMin: 20, speedMax: 60,
        colors: ['#888', '#666', '#444'],
        life: 0.6,
        sizeMin: 1, sizeMax: 3,
        gravity: 100,
      });
    }
    // Drop pickup
    const dropRoll = Math.random();
    if (dropRoll < 0.30) {
      createUpgradePickup(state.ecs, pos.x, pos.y, rollUpgrade());
    } else if (dropRoll < 0.50) {
      createHealthPickup(state.ecs, pos.x, pos.y, 20);
    }
    if (state.menus) state.menus.stats.enemiesKilled++;
    state.ecs.destroy(id);
  }

  patrol(dt, ai, pos, vel) {
    const target = ai.patrolTarget === 'A' ? ai.patrolPointA : ai.patrolPointB;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 3) {
      ai.patrolTarget = ai.patrolTarget === 'A' ? 'B' : 'A';
      ai.state = 'idle';
      ai.stateTimer = 1 + Math.random() * 2;
      vel.x = 0;
      vel.y = 0;
      return;
    }

    vel.x = (dx / dist) * ai.speed * 0.5;
    vel.y = (dy / dist) * ai.speed * 0.5;
    ai.facingX = dx > 0 ? 1 : -1;
  }

  chase(dt, ai, pos, vel, playerPos) {
    const dir = Physics.direction(pos.x, pos.y, playerPos.x, playerPos.y);
    vel.x = dir.x * ai.speed;
    vel.y = dir.y * ai.speed;
    if (dir.x !== 0) ai.facingX = dir.x > 0 ? 1 : -1;
  }

  spawnEnemyHitbox(ownerId, pos, ai, state) {
    if (!state.combatSystem) return;
    const ad = ai._attackDir || ai._lungeDir || { x: ai.facingX, y: 0 };
    const s = ai._scale || 1;
    const hx = pos.x + ad.x * 12 * s;
    const hy = pos.y + ad.y * 12 * s;
    const hw = Math.round(12 * s);
    const hh = Math.round(10 * s);

    state.combatSystem.activeHitboxes.push({
      x: hx - hw / 2,
      y: hy - hh / 2,
      w: hw,
      h: hh,
      damage: ai.attackDamage,
      owner: ownerId,
      hitEntities: new Set(),
      knockbackX: ad.x * 100 * s,
      knockbackY: ad.y * 100 * s,
      type: 'enemy_attack',
      lifetime: ai.attackActive,
    });
  }

  spawnProjectile(fromPos, targetPos, damage, state) {
    if (state.audio) state.audio.playProjectile();
    const dir = Physics.direction(fromPos.x, fromPos.y, targetPos.x, targetPos.y);
    const id = state.ecs.create();
    state.ecs.add(id, 'position', { x: fromPos.x, y: fromPos.y });
    state.ecs.add(id, 'velocity', { x: dir.x * 120, y: dir.y * 120 });
    state.ecs.add(id, 'projectile', {
      damage,
      lifetime: 3.0,
      owner: 'enemy',
    });
    state.ecs.tag(id, 'projectile');
  }

  updateProjectiles(dt, state) {
    const { ecs, tilemap } = state;
    const projectiles = [...ecs.queryTag('projectile')];

    for (const id of projectiles) {
      const proj = ecs.get(id, 'projectile');
      const pos = ecs.get(id, 'position');
      const vel = ecs.get(id, 'velocity');
      if (!proj || !pos || !vel) continue;

      proj.lifetime -= dt;
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;

      // Expire
      if (proj.lifetime <= 0) {
        ecs.destroy(id);
        continue;
      }

      // Hit wall
      if (tilemap) {
        const tx = Math.floor(pos.x / tilemap.tileSize);
        const ty = Math.floor(pos.y / tilemap.tileSize);
        if (tilemap.isSolid(tx, ty)) {
          if (state.particles) {
            state.particles.emit({
              x: pos.x, y: pos.y,
              count: 4, speedMin: 20, speedMax: 50,
              colors: ['#f44', '#ff8'],
              life: 0.2, sizeMin: 1, sizeMax: 2,
            });
          }
          ecs.destroy(id);
          continue;
        }
      }

      // Hit player
      if (proj.owner === 'enemy') {
        const ppos = ecs.get(state.playerId, 'position');
        const pcol = ecs.get(state.playerId, 'collider');
        const player = ecs.get(state.playerId, 'player');
        if (ppos && pcol && player && !player.invincible && player.state !== 'dead') {
          const d = Physics.distance(pos.x, pos.y, ppos.x, ppos.y);
          if (d < 8) {
            // Hit the player via combat system
            state.combatSystem.onHit(state.playerId, {
              damage: proj.damage,
              knockbackX: vel.x > 0 ? 60 : -60,
              knockbackY: vel.y > 0 ? 30 : -30,
              type: 'projectile',
              owner: -1,
              hitEntities: new Set(),
            }, state);
            if (state.particles) {
              state.particles.emit({
                x: pos.x, y: pos.y,
                count: 6, speedMin: 30, speedMax: 70,
                colors: ['#f44', '#ff0'],
                life: 0.3, sizeMin: 1, sizeMax: 2,
              });
            }
            ecs.destroy(id);
          }
        }
      }
    }
  }

  updateHazards(dt, state) {
    const { ecs, particles } = state;
    const hazards = [...ecs.queryTag('hazard')];

    for (const id of hazards) {
      const hazard = ecs.get(id, 'hazard');
      const pos = ecs.get(id, 'position');
      if (!hazard || !pos) continue;

      hazard.delay -= dt;

      // Warning indicator (flashing circle)
      if (!hazard.warned && hazard.delay < 0.6) {
        hazard.warned = true;
      }

      if (hazard.delay <= 0) {
        // Explode
        if (state.combatSystem) {
          state.combatSystem.activeHitboxes.push({
            x: pos.x - hazard.radius / 2,
            y: pos.y - hazard.radius / 2,
            w: hazard.radius,
            h: hazard.radius,
            damage: hazard.damage,
            owner: -1,
            hitEntities: new Set(),
            knockbackX: 0,
            knockbackY: -80,
            type: 'explosion',
            lifetime: 0.1,
          });
        }
        if (particles) {
          particles.emit({
            x: pos.x, y: pos.y, count: 15,
            speedMin: 30, speedMax: 100,
            colors: ['#f80', '#ff0', '#f44'],
            life: 0.4, sizeMin: 2, sizeMax: 4, gravity: 60,
          });
        }
        if (state.camera) state.camera.shake(4, 0.15);
        if (state.audio) state.audio.playExplosion();
        ecs.destroy(id);
      }
    }
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
}
