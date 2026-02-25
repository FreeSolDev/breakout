export class LightingSystem {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');

    this.ambientColor = 'rgba(10, 8, 20, 0.55)';
    this.lights = [];       // persistent lights (from room)
    this.flashLights = [];  // temporary lights (muzzle flash, explosions)
    this._lightCache = new Map(); // cached gradient canvases for persistent lights
    this._brushCache = new Map(); // cached gradient brushes keyed by "radius|color"
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  clear() {
    this.lights = [];
    this.flashLights = [];
    this._lightCache.clear();
  }

  addLight(light) {
    this.lights.push(light);
    return this.lights.length - 1;
  }

  removeLight(index) {
    this.lights.splice(index, 1);
  }

  flash(x, y, radius, color, duration) {
    this.flashLights.push({ x, y, radius, color, intensity: 1, duration, timer: duration });
  }

  update(dt) {
    for (let i = this.flashLights.length - 1; i >= 0; i--) {
      const fl = this.flashLights[i];
      fl.timer -= dt;
      fl.intensity = Math.max(0, fl.timer / fl.duration);
      if (fl.timer <= 0) {
        this.flashLights.splice(i, 1);
      }
    }
  }

  // Pre-render a radial gradient brush to an offscreen canvas, cached by radius+color
  _getBrush(radius, color) {
    const r = Math.round(radius);
    if (r <= 0) return null;
    const key = r + '|' + color;
    let brush = this._brushCache.get(key);
    if (brush) return brush;
    const d = r * 2;
    brush = document.createElement('canvas');
    brush.width = d;
    brush.height = d;
    const bc = brush.getContext('2d');
    const grad = bc.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    bc.fillStyle = grad;
    bc.fillRect(0, 0, d, d);
    this._brushCache.set(key, brush);
    return brush;
  }

  render(ctx, camera, state) {
    const lc = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Fill with ambient darkness
    lc.globalCompositeOperation = 'source-over';
    lc.fillStyle = this.ambientColor;
    lc.fillRect(0, 0, w, h);

    // Draw lights in 'lighter' mode (additive on the light map)
    lc.globalCompositeOperation = 'lighter';

    const ox = -camera.x + camera.shakeOffsetX + camera.punchX;
    const oy = -camera.y + camera.shakeOffsetY + camera.punchY;

    // Persistent lights (cached gradient canvases)
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const sx = Math.round(light.x + ox - light.radius);
      const sy = Math.round(light.y + oy - light.radius);
      const d = light.radius * 2;
      // Skip offscreen
      if (sx + d < 0 || sx > w || sy + d < 0 || sy > h) continue;
      let cached = this._lightCache.get(i);
      if (!cached) {
        cached = document.createElement('canvas');
        cached.width = d;
        cached.height = d;
        const gc = cached.getContext('2d');
        const grad = gc.createRadialGradient(light.radius, light.radius, 0, light.radius, light.radius, light.radius);
        grad.addColorStop(0, light.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        gc.fillStyle = grad;
        gc.fillRect(0, 0, d, d);
        this._lightCache.set(i, cached);
      }
      lc.drawImage(cached, sx, sy);
    }

    // Player glow (cached brush)
    if (state.playerId !== undefined) {
      const pos = state.ecs.get(state.playerId, 'position');
      if (pos) {
        this._drawCachedLight(lc, pos.x + ox, pos.y + oy, 50, 'rgba(180, 200, 255, 0.3)', 1);
      }
    }

    // Flash lights (varying radius — use rounded brush cache)
    for (const fl of this.flashLights) {
      this._drawCachedLight(lc, fl.x + ox, fl.y + oy, fl.radius * fl.intensity, fl.color, fl.intensity);
    }

    // Wire energy pulse glow
    if (this.wirePulse) {
      const wp = this.wirePulse;
      this._drawCachedLight(lc, wp.x + ox, wp.y + oy, 30, 'rgba(0, 255, 60, 0.5)', 1);
      this.wirePulse = null;
    }

    // Projectile lights
    if (this.projectileLights) {
      for (const pl of this.projectileLights) {
        this._drawCachedLight(lc, pl.x + ox, pl.y + oy, 28, 'rgba(255, 240, 220, 0.6)', 1);
      }
      this.projectileLights = null;
    }

    // Composite light map over game with multiply
    lc.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // Draw a light using a cached brush canvas instead of creating a gradient each call
  _drawCachedLight(ctx, x, y, radius, color, intensity) {
    if (radius <= 0 || intensity <= 0) return;
    if (x + radius < 0 || x - radius > this.canvas.width || y + radius < 0 || y - radius > this.canvas.height) return;
    const brush = this._getBrush(radius, color);
    if (!brush) return;
    const r = Math.round(radius);
    ctx.globalAlpha = intensity;
    ctx.drawImage(brush, Math.round(x) - r, Math.round(y) - r);
    ctx.globalAlpha = 1;
  }
}
