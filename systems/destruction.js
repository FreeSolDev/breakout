import { Physics } from '../engine/physics.js';
import { createWeaponPickup, WEAPON_DEFS } from '../entities/weapons.js';
import { rollUpgrade, createUpgradePickup, createHealthPickup } from '../entities/pickups.js';

const WEAPON_TYPES = Object.keys(WEAPON_DEFS);

export class DestructionSystem {
  update(dt, state) {
    const { ecs, particles } = state;
    if (!ecs) return;

    const props = ecs.queryTag('prop');
    for (const id of props) {
      const health = ecs.get(id, 'health');
      const prop = ecs.get(id, 'prop');
      const pos = ecs.get(id, 'position');
      if (!health || !prop || !pos) continue;

      if (health.current <= 0 && !prop.destroyed) {
        this.destroyProp(id, prop, pos, state);
      }
    }
  }

  destroyProp(id, prop, pos, state) {
    const { ecs, particles, camera } = state;
    const def = prop.def;
    prop.destroyed = true;

    // Debris particles
    if (particles) {
      particles.emit({
        x: pos.x, y: pos.y,
        count: 10,
        speedMin: 30, speedMax: 100,
        colors: def.debris,
        life: 0.5,
        sizeMin: 1, sizeMax: 3,
        gravity: 80,
      });
    }

    // Screen shake
    if (camera) {
      camera.shake(3, 0.15);
    }

    // Handle drops
    for (const drop of def.drops) {
      if (drop === 'weapon') {
        const type = WEAPON_TYPES[Math.floor(Math.random() * WEAPON_TYPES.length)];
        createWeaponPickup(ecs, pos.x, pos.y, type);
      } else if (drop === 'health') {
        createHealthPickup(ecs, pos.x, pos.y, 25);
      }
    }

    // 20% chance to also drop an upgrade from destroyed props
    if (Math.random() < 0.2) {
      createUpgradePickup(ecs, pos.x + 8, pos.y, rollUpgrade());
    }

    // Explosion for barrels
    if (def.explosive) {
      this.explode(id, pos, def, state);
    }

    // Remove entity
    ecs.destroy(id);
  }

  explode(sourceId, pos, def, state) {
    const { ecs, particles, camera, combatSystem } = state;

    // Big explosion particles
    if (particles) {
      particles.emit({
        x: pos.x, y: pos.y,
        count: 25,
        speedMin: 40, speedMax: 150,
        colors: ['#f80', '#ff0', '#fff', '#f44'],
        life: 0.6,
        sizeMin: 2, sizeMax: 4,
        gravity: 40,
      });
    }

    // Big shake
    if (camera) {
      camera.shake(8, 0.3);
    }
    if (state.audio) state.audio.playExplosion();

    // Create explosion hitbox
    if (combatSystem) {
      combatSystem.activeHitboxes.push({
        x: pos.x - def.explosionRadius / 2,
        y: pos.y - def.explosionRadius / 2,
        w: def.explosionRadius,
        h: def.explosionRadius,
        damage: def.explosionDamage,
        owner: sourceId,
        hitEntities: new Set([sourceId]),
        knockbackX: 0,
        knockbackY: -80,
        type: 'explosion',
        lifetime: 0.1,
      });
    }

    // Chain: damage nearby barrels
    const props = ecs.queryTag('prop');
    for (const pid of props) {
      if (pid === sourceId) continue;
      const pprop = ecs.get(pid, 'prop');
      const ppos = ecs.get(pid, 'position');
      const phealth = ecs.get(pid, 'health');
      if (!pprop || !ppos || !phealth) continue;
      if (!pprop.def.explosive) continue;

      const d = Physics.distance(pos.x, pos.y, ppos.x, ppos.y);
      if (d < def.explosionRadius) {
        // Chain explosion — damage the nearby barrel
        phealth.current = 0;
      }
    }
  }
}
