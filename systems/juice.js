export class JuiceSystem {
  constructor() {
    this.hitstopFrames = 0;
    this.flashEntities = new Map(); // entityId -> frames remaining
    this.impacts = []; // visual impact effects (shockwaves, ground cracks)
  }

  update(dt, state) {
    // Process hitstop
    if (this.hitstopFrames > 0) {
      this.hitstopFrames--;
      state.hitstopActive = true;
      return; // Skip normal updates while frozen
    }
    state.hitstopActive = false;

    // Decay flash timers
    for (const [id, frames] of this.flashEntities) {
      if (frames <= 0) {
        this.flashEntities.delete(id);
      } else {
        this.flashEntities.set(id, frames - 1);
      }
    }

    // Update impact effects
    let i = 0;
    while (i < this.impacts.length) {
      const fx = this.impacts[i];
      fx.timer -= dt;
      fx.t = 1 - fx.timer / fx.maxTimer; // 0→1 progress
      if (fx.timer <= 0) {
        this.impacts[i] = this.impacts[this.impacts.length - 1];
        this.impacts.pop();
      } else {
        i++;
      }
    }

    // Process hit events from this frame
    const events = state.hitEvents;
    if (!events || events.length === 0) return;

    for (const event of events) {
      this.processHit(event, state);
    }
  }

  processHit(event, state) {
    const { camera, lighting } = state;
    const type = event.hitbox.type;
    const pos = event.position;

    const pp = state.postprocess;

    if (type === 'attack_heavy') {
      this.hitstopFrames = 5;
      this.flashEntities.set(event.targetId, 5);
      if (camera) {
        camera.shake(6, 0.2);
        const dir = event.hitbox.knockbackX > 0 ? 1 : -1;
        camera.punch(dir, 0, 4);
      }
      if (lighting && pos) lighting.flash(pos.x, pos.y, 60, 'rgba(255,200,100,0.6)', 0.15);
      if (pp) pp.triggerAberration(1.5);
      // Shockwave + ground crack
      if (pos) {
        this.spawnShockwave(pos.x, pos.y, 30, 0.25, '#ff8');
        this.spawnGroundCrack(pos.x, pos.y, event.hitbox.knockbackX, event.hitbox.knockbackY);
        this.spawnDustBurst(pos.x, pos.y, state);
      }
    } else if (type === 'attack_light_3' || type === 'attack_light_4') {
      this.hitstopFrames = 4;
      this.flashEntities.set(event.targetId, 4);
      if (camera) camera.shake(4, 0.15);
      if (lighting && pos) lighting.flash(pos.x, pos.y, 40, 'rgba(255,220,150,0.4)', 0.1);
      if (pp) pp.triggerAberration(0.8);
      // Smaller shockwave on combo finishers
      if (pos) {
        this.spawnShockwave(pos.x, pos.y, 18, 0.18, '#ffa');
      }
    } else if (type === 'explosion') {
      this.hitstopFrames = 6;
      this.flashEntities.set(event.targetId, 5);
      if (camera) camera.shake(10, 0.35);
      if (lighting && pos) lighting.flash(pos.x, pos.y, 90, 'rgba(255,150,50,0.8)', 0.3);
      if (pp) pp.triggerAberration(2);
      // Big explosion shockwave
      if (pos) {
        this.spawnShockwave(pos.x, pos.y, 50, 0.35, '#f80');
        this.spawnShockwave(pos.x, pos.y, 35, 0.25, '#ff4');
        this.spawnDustBurst(pos.x, pos.y, state);
      }
    } else if (type === 'thrown_enemy') {
      this.hitstopFrames = 3;
      this.flashEntities.set(event.targetId, 4);
      if (camera) camera.shake(5, 0.2);
      // Ground slam from thrown enemy
      if (pos) {
        this.spawnShockwave(pos.x, pos.y, 22, 0.2, '#aaf');
        this.spawnDustBurst(pos.x, pos.y, state);
      }
    } else {
      this.hitstopFrames = 2;
      this.flashEntities.set(event.targetId, 3);
      if (camera) camera.shake(2, 0.1);
      if (lighting && pos) lighting.flash(pos.x, pos.y, 25, 'rgba(255,255,200,0.3)', 0.08);
    }
  }

  spawnShockwave(x, y, radius, duration, color) {
    this.impacts.push({
      type: 'shockwave',
      x, y, radius, color,
      timer: duration,
      maxTimer: duration,
      t: 0,
    });
  }

  spawnGroundCrack(x, y, kbX, kbY) {
    // Radial lines from impact point, biased toward knockback direction
    const angle = Math.atan2(kbY, kbX);
    const lines = [];
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * Math.PI * 1.2;
      const len = 8 + Math.random() * 14;
      lines.push({ angle: a, len });
    }
    this.impacts.push({
      type: 'crack',
      x, y, lines,
      timer: 0.5,
      maxTimer: 0.5,
      t: 0,
    });
  }

  spawnDustBurst(x, y, state) {
    if (!state.particles) return;
    state.particles.emit({
      x, y,
      count: 6,
      speedMin: 15, speedMax: 50,
      colors: ['#998', '#887', '#776'],
      life: 0.4,
      sizeMin: 1, sizeMax: 3,
      gravity: -10,
      spread: Math.PI * 2,
    });
  }

  renderImpacts(ctx) {
    for (const fx of this.impacts) {
      if (fx.type === 'shockwave') {
        this.renderShockwave(ctx, fx);
      } else if (fx.type === 'crack') {
        this.renderCrack(ctx, fx);
      }
    }
  }

  renderShockwave(ctx, fx) {
    const r = fx.radius * fx.t;
    const alpha = (1 - fx.t) * 0.7;
    if (r <= 0 || alpha <= 0) return;

    const x = Math.round(fx.x);
    const y = Math.round(fx.y);

    // Expanding ring — draw as 4 rect edges of a growing square
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = Math.max(1, 2 * (1 - fx.t));
    ctx.strokeRect(x - r, y - r, r * 2, r * 2);

    // Inner ring (slightly smaller, more transparent)
    const r2 = r * 0.6;
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeRect(x - r2, y - r2, r2 * 2, r2 * 2);

    ctx.globalAlpha = 1;
  }

  renderCrack(ctx, fx) {
    const alpha = (1 - fx.t) * 0.6;
    if (alpha <= 0) return;

    ctx.globalAlpha = alpha;
    const x = Math.round(fx.x);
    const y = Math.round(fx.y);

    for (const line of fx.lines) {
      // Lines grow outward then stay
      const progress = Math.min(1, fx.t * 3); // fully extended at 33% of lifetime
      const len = line.len * progress;
      const ex = x + Math.cos(line.angle) * len;
      const ey = y + Math.sin(line.angle) * len;

      // Main crack line
      ctx.strokeStyle = '#665';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.round(ex), Math.round(ey));
      ctx.stroke();

      // Bright edge
      ctx.strokeStyle = '#aa9';
      ctx.globalAlpha = alpha * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + 1, y);
      ctx.lineTo(Math.round(ex) + 1, Math.round(ey));
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    ctx.globalAlpha = 1;
  }

  isFlashing(entityId) {
    return (this.flashEntities.get(entityId) || 0) > 0;
  }
}
