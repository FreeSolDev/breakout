export class Physics {
  static aabb(a, b) {
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + a.h > b.y;
  }

  static overlap(a, b) {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return { x: ox, y: oy };
  }

  // Resolve collision: push entity out of solid
  static resolve(entity, solid) {
    const o = Physics.overlap(entity, solid);
    if (o.x <= 0 || o.y <= 0) return;
    if (o.x < o.y) {
      // Push horizontally
      if (entity.x + entity.w / 2 < solid.x + solid.w / 2) {
        entity.x -= o.x;
      } else {
        entity.x += o.x;
      }
    } else {
      // Push vertically
      if (entity.y + entity.h / 2 < solid.y + solid.h / 2) {
        entity.y -= o.y;
      } else {
        entity.y += o.y;
      }
    }
  }

  // Circle vs circle (for attack hitboxes)
  static circleOverlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < ar + br;
  }

  // Point in rect
  static pointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w &&
           py >= rect.y && py <= rect.y + rect.h;
  }

  // Direction from a to b (normalized)
  static direction(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: 0, y: 0 };
    return { x: dx / len, y: dy / len };
  }

  // Distance between two points
  static distance(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
