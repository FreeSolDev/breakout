export class ParticleSystem {
  constructor() {
    this.particles = [];
    this._pool = [];
  }

  _acquire() {
    return this._pool.length > 0 ? this._pool.pop() : {};
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
      const p = this._acquire();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.size = sizeMin + Math.random() * (sizeMax - sizeMin);
      p.life = life + (Math.random() - 0.5) * lifeVariance;
      p.maxLife = life;
      p.color = c;
      p.gravity = gravity;
      p.friction = friction;
      this.particles.push(p);
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
        this._pool.push(p);
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
    for (let i = 0; i < this.particles.length; i++) this._pool.push(this.particles[i]);
    this.particles.length = 0;
  }
}
