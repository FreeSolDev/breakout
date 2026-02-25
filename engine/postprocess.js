export class PostProcess {
  constructor(width, height) {
    this.w = width;
    this.h = height;

    // Pre-render vignette once (never changes)
    this.vignetteCanvas = document.createElement('canvas');
    this.vignetteCanvas.width = width;
    this.vignetteCanvas.height = height;
    this._renderVignette();

    // Pre-render scanlines once (never changes)
    this.scanlinesEnabled = true;
    this.scanlinesCanvas = document.createElement('canvas');
    this.scanlinesCanvas.width = width;
    this.scanlinesCanvas.height = height;
    this._renderScanlines();

    // Chromatic aberration state
    this.aberrationTimer = 0;
    this.aberrationIntensity = 0;

    // Offscreen buffer for aberration
    this.buffer = document.createElement('canvas');
    this.buffer.width = width;
    this.buffer.height = height;
    this.bufCtx = this.buffer.getContext('2d');
  }

  // Call when player takes a hit (during hitstop)
  triggerAberration(intensity = 1) {
    this.aberrationTimer = 0.12;
    this.aberrationIntensity = intensity;
  }

  update(dt) {
    if (this.aberrationTimer > 0) {
      this.aberrationTimer -= dt;
      if (this.aberrationTimer <= 0) {
        this.aberrationTimer = 0;
        this.aberrationIntensity = 0;
      }
    }
  }

  render(ctx) {
    // Chromatic aberration (must run before vignette/scanlines)
    if (this.aberrationTimer > 0) {
      const t = this.aberrationTimer / 0.12; // 1→0
      const offset = Math.round(t * this.aberrationIntensity * 2);
      if (offset > 0) {
        // Copy current frame
        this.bufCtx.drawImage(ctx.canvas, 0, 0);

        // Red channel shifted left
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.3 * t;
        ctx.drawImage(this.buffer, -offset, 0);

        // Blue channel shifted right
        ctx.drawImage(this.buffer, offset, 0);

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Vignette overlay
    ctx.drawImage(this.vignetteCanvas, 0, 0);

    // CRT scanlines (pre-rendered)
    if (this.scanlinesEnabled) {
      ctx.drawImage(this.scanlinesCanvas, 0, 0);
    }
  }

  _renderScanlines() {
    const ctx = this.scanlinesCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let y = 0; y < this.h; y += 2) {
      ctx.fillRect(0, y, this.w, 1);
    }
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.vignetteCanvas.width = w;
    this.vignetteCanvas.height = h;
    this._renderVignette();
    this.scanlinesCanvas.width = w;
    this.scanlinesCanvas.height = h;
    this._renderScanlines();
    this.buffer.width = w;
    this.buffer.height = h;
  }

  _renderVignette() {
    const ctx = this.vignetteCanvas.getContext('2d');
    const cx = this.w / 2;
    const cy = this.h / 2;
    const r = Math.max(cx, cy) * 1.2;

    const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}
