import { Physics } from '../engine/physics.js';

export class EntityCollisionSystem {
  update(dt, state) {
    const { ecs } = state;
    if (!ecs) return;

    // Only check player + enemies for pushback (not pickups, props, projectiles)
    const bodies = [];

    // Player
    const player = ecs.get(state.playerId, 'player');
    const ppos = ecs.get(state.playerId, 'position');
    const pcol = ecs.get(state.playerId, 'collider');
    if (player && ppos && pcol && player.state !== 'dash' && player.state !== 'dead') {
      bodies.push({ id: state.playerId, pos: ppos, col: pcol });
    }

    // Enemies
    const enemies = ecs.queryTag('enemy');
    for (const eid of enemies) {
      const ai = ecs.get(eid, 'ai');
      if (ai && (ai.state === 'dead' || ai.state === 'grabbed' || ai.state === 'thrown')) continue;
      const pos = ecs.get(eid, 'position');
      const col = ecs.get(eid, 'collider');
      if (pos && col) bodies.push({ id: eid, pos, col });
    }

    // Pairwise pushback
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];

        const ax = a.pos.x + a.col.offsetX;
        const ay = a.pos.y + a.col.offsetY;
        const bx = b.pos.x + b.col.offsetX;
        const by = b.pos.y + b.col.offsetY;

        const boxA = { x: ax, y: ay, w: a.col.w, h: a.col.h };
        const boxB = { x: bx, y: by, w: b.col.w, h: b.col.h };

        if (!Physics.aabb(boxA, boxB)) continue;

        const o = Physics.overlap(boxA, boxB);
        if (o.x <= 0 || o.y <= 0) continue;

        if (o.x < o.y) {
          const sign = (boxA.x + boxA.w / 2) < (boxB.x + boxB.w / 2) ? -1 : 1;
          const half = o.x / 2;
          a.pos.x += sign * half;
          b.pos.x -= sign * half;
        } else {
          const sign = (boxA.y + boxA.h / 2) < (boxB.y + boxB.h / 2) ? -1 : 1;
          const half = o.y / 2;
          a.pos.y += sign * half;
          b.pos.y -= sign * half;
        }
      }
    }
  }
}
