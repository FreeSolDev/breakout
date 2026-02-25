// Procedural blood pool decals that persist on the floor
export class BloodPoolSystem {
  constructor() {
    this.pools = [];
    this.maxPools = 60;
  }

  // Spawn a blood pool with procedural shape
  add(x, y, size) {
    // Generate 3-6 overlapping blobs for organic splatter shape
    const blobCount = 3 + Math.floor(Math.random() * 4);
    const blobs = [];
    for (let i = 0; i < blobCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * size * 0.6;
      blobs.push({
        ox: Math.cos(angle) * dist,
        oy: Math.sin(angle) * dist,
        rx: size * (0.3 + Math.random() * 0.5),
        ry: size * (0.2 + Math.random() * 0.4),
        rot: Math.random() * Math.PI,
      });
    }

    this.pools.push({
      x, y, blobs,
      alpha: 0.6 + Math.random() * 0.15,
      life: 20 + Math.random() * 10, // fade over 20-30s
      maxLife: 25,
    });

    // Cap pool count — remove oldest
    if (this.pools.length > this.maxPools) {
      this.pools.shift();
    }
  }

  // Smaller splatter for bleed ticks
  addDrip(x, y) {
    const blobs = [];
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      blobs.push({
        ox: (Math.random() - 0.5) * 3,
        oy: (Math.random() - 0.5) * 3,
        rx: 1.5 + Math.random() * 2,
        ry: 1 + Math.random() * 1.5,
        rot: Math.random() * Math.PI,
      });
    }

    this.pools.push({
      x, y, blobs,
      alpha: 0.4 + Math.random() * 0.15,
      life: 15 + Math.random() * 10,
      maxLife: 20,
    });

    if (this.pools.length > this.maxPools) {
      this.pools.shift();
    }
  }

  update(dt) {
    let i = 0;
    while (i < this.pools.length) {
      const p = this.pools[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pools[i] = this.pools[this.pools.length - 1];
        this.pools.pop();
      } else {
        i++;
      }
    }
  }

  render(ctx) {
    for (const p of this.pools) {
      // Fade out in last 5 seconds
      const fadeAlpha = p.life < 5 ? p.life / 5 : 1;
      ctx.globalAlpha = p.alpha * fadeAlpha;

      for (const b of p.blobs) {
        ctx.save();
        ctx.translate(Math.round(p.x + b.ox), Math.round(p.y + b.oy));
        ctx.rotate(b.rot);
        ctx.fillStyle = '#600';
        ctx.fillRect(-Math.round(b.rx), -Math.round(b.ry), Math.round(b.rx * 2), Math.round(b.ry * 2));
        // Darker center
        ctx.fillStyle = '#400';
        const cx = Math.round(b.rx * 0.5);
        const cy = Math.round(b.ry * 0.5);
        ctx.fillRect(-cx, -cy, cx * 2, cy * 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.pools = [];
  }
}
