export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(config) {
    const {
      x, y, count = 10,
      speedMin = 20, speedMax = 80,
      sizeMin = 1, sizeMax = 3,
      life = 0.5, lifeVariance = 0.2,
      color = '#fff', colors = null,
      gravity = 0, friction = 0.98,
      angle = 0, spread = Math.PI * 2
    } = config;

    for (let i = 0; i < count; i++) {
      const a = angle - spread / 2 + Math.random() * spread;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const c = colors ? colors[Math.floor(Math.random() * colors.length)] : color;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        life: life + (Math.random() - 0.5) * lifeVariance,
        maxLife: life,
        color: c,
        gravity,
        friction
      });
    }
  }

  update(dt) {
    let i = 0;
    while (i < this.particles.length) {
      const p = this.particles[i];
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        // Swap-and-pop: O(1) removal
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      } else {
        i++;
      }
    }
  }

  render(ctx) {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const s = Math.round(p.size * (p.life / p.maxLife));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, s), Math.max(1, s));
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.particles = [];
  }
}
