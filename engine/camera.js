export class Camera {
  constructor(width, height) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
    this.targetX = 0;
    this.targetY = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.smoothing = 0.1;

    // Shake
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeTimer = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;

    // Punch (directional jolt)
    this.punchX = 0;
    this.punchY = 0;
    this.punchDecay = 0.85;

    // Pan (cutscene)
    this.panTarget = null;
    this.panSpeed = 0;
    this.panCallback = null;

    // Bounds (room clamping)
    this.boundsX = 0;
    this.boundsY = 0;
    this.boundsW = Infinity;
    this.boundsH = Infinity;
  }

  setBounds(x, y, w, h) {
    this.boundsX = x;
    this.boundsY = y;
    this.boundsW = w;
    this.boundsH = h;
  }

  follow(x, y) {
    this.targetX = x - this.width / 2;
    this.targetY = y - this.height / 2;
  }

  shake(intensity, duration) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  punch(dx, dy, force) {
    this.punchX = dx * force;
    this.punchY = dy * force;
  }

  panTo(x, y, speed, callback) {
    this.panTarget = { x: x - this.width / 2, y: y - this.height / 2 };
    this.panSpeed = speed;
    this.panCallback = callback;
  }

  zoomTo(level) {
    this.targetZoom = level;
  }

  update(dt) {
    // Pan override
    if (this.panTarget) {
      const dx = this.panTarget.x - this.x;
      const dy = this.panTarget.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) {
        this.x = this.panTarget.x;
        this.y = this.panTarget.y;
        const cb = this.panCallback;
        this.panTarget = null;
        this.panCallback = null;
        if (cb) cb();
      } else {
        this.x += (dx / dist) * this.panSpeed * dt;
        this.y += (dy / dist) * this.panSpeed * dt;
      }
    } else {
      // Smooth follow
      this.x += (this.targetX - this.x) * this.smoothing;
      this.y += (this.targetY - this.y) * this.smoothing;

      // Clamp to bounds — center if room is smaller than viewport
      if (this.boundsW <= this.width) {
        this.x = this.boundsX + (this.boundsW - this.width) / 2;
      } else {
        this.x = Math.max(this.boundsX, Math.min(this.x, this.boundsW - this.width));
      }
      if (this.boundsH <= this.height) {
        this.y = this.boundsY + (this.boundsH - this.height) / 2;
      } else {
        this.y = Math.max(this.boundsY, Math.min(this.y, this.boundsH - this.height));
      }
    }

    // Zoom interpolation
    this.zoom += (this.targetZoom - this.zoom) * 0.1;

    // Shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const progress = this.shakeTimer / this.shakeDuration;
      const intensity = this.shakeIntensity * progress;
      this.shakeOffsetX = (Math.random() * 2 - 1) * intensity;
      this.shakeOffsetY = (Math.random() * 2 - 1) * intensity;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    // Punch decay
    this.punchX *= this.punchDecay;
    this.punchY *= this.punchDecay;
    if (Math.abs(this.punchX) < 0.1) this.punchX = 0;
    if (Math.abs(this.punchY) < 0.1) this.punchY = 0;
  }

  apply(ctx) {
    const ox = Math.round(-this.x + this.shakeOffsetX + this.punchX);
    const oy = Math.round(-this.y + this.shakeOffsetY + this.punchY);
    ctx.translate(ox, oy);
  }
}
