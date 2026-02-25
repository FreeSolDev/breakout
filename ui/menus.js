import { solPrice } from '../engine/sol-price.js';

export class MenuSystem {
  constructor() {
    this.currentMenu = 'title'; // 'title', 'none', 'pause', 'gameover', 'victory'
    this.selection = 0;
    this.stats = { enemiesKilled: 0, roomsCleared: 0, floorReached: 1 };
    this.titleTimer = 0;
    this.fadeAlpha = 0;
    this.touchMode = false; // set externally when touch device detected
    this._goTimer = 0;        // game-over animation timer
    this._goReady = false;    // retry prompt visible & accepting input

    // Promo video for title screen
    this._promoVideo = document.createElement('video');
    this._promoVideo.src = './breakoutloop.mp4';
    this._promoVideo.loop = true;
    this._promoVideo.muted = true;
    this._promoVideo.playsInline = true;
    this._promoVideo.preload = 'auto';
    this._promoVideo.play().catch(() => {}); // autoplay, ignore policy errors
  }

  update(dt, state) {
    const input = state.input;

    if (this.currentMenu === 'title') {
      this.titleTimer += dt;
      if (input.pressed('attack') || input.pressed('interact') || input.pressed('dash')) {
        this.currentMenu = 'none';
        this._promoVideo.pause();
        if (state.audio) { state.audio.init(); state.audio.playMenuConfirm(); }
      }
      return true; // Block game updates
    }

    if (this.currentMenu === 'none') {
      if (input.pressed('pause')) {
        this.currentMenu = 'pause';
        this.selection = 0;
        if (state.audio) state.audio.playMenuSelect();
      }
      // Check for player death
      const player = state.ecs.get(state.playerId, 'player');
      if (player && player.state === 'dead') {
        this.fadeAlpha += dt * 2;
        // Gradually restore time scale during death fade
        if (state.timeScale < 1) state.timeScale = Math.min(1, state.timeScale + dt * 1.5);
        if (this.fadeAlpha >= 1) {
          this.currentMenu = 'gameover';
          this.selection = 0;
          this._goTimer = 0;
          this._goReady = false;
          state.timeScale = 1;
        }
        return false; // Let game run for death animation
      }
      this.fadeAlpha = 0;
      return false; // Don't block game updates
    }

    if (this.currentMenu === 'pause') {
      if (input.pressed('pause')) {
        this.currentMenu = 'none';
        if (state.audio) state.audio.playMenuConfirm();
        return false;
      }
      if (input.pressed('up')) { this.selection = Math.max(0, this.selection - 1); if (state.audio) state.audio.playMenuSelect(); }
      if (input.pressed('down')) { this.selection = Math.min(1, this.selection + 1); if (state.audio) state.audio.playMenuSelect(); }
      if (input.pressed('attack') || input.pressed('interact')) {
        if (state.audio) state.audio.playMenuConfirm();
        if (this.selection === 0) {
          this.currentMenu = 'none'; // Resume
        } else if (this.selection === 1) {
          return 'restart'; // Signal restart
        }
      }
      return true; // Block game updates
    }

    if (this.currentMenu === 'gameover') {
      this._goTimer += dt;
      this._goReady = this._goTimer >= 4.8;
      if (this._goReady && (input.pressed('attack') || input.pressed('interact'))) {
        if (state.audio) state.audio.playMenuConfirm();
        return 'restart';
      }
      return true;
    }

    if (this.currentMenu === 'victory') {
      if (input.pressed('attack') || input.pressed('interact')) {
        if (state.audio) state.audio.playMenuConfirm();
        return 'restart';
      }
      return true;
    }

    return false;
  }

  triggerVictory() {
    this.currentMenu = 'victory';
    this.selection = 0;
  }

  render(ctx, state) {
    this._vw = (state && state.vw) || 480;
    if (this.currentMenu === 'title') {
      this.renderTitle(ctx);
      return;
    }

    if (this.currentMenu === 'pause') {
      this.renderPause(ctx);
      return;
    }

    if (this.currentMenu === 'gameover') {
      this.renderGameOver(ctx);
      return;
    }

    if (this.currentMenu === 'victory') {
      this.renderVictory(ctx);
      return;
    }

    // Death fade
    if (this.fadeAlpha > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.fadeAlpha)})`;
      ctx.fillRect(0, 0, this._vw, 270);
    }
  }

  renderTitle(ctx) {
    const vw = this._vw;
    const vh = 270;
    const t = this.titleTimer;

    // Video background — letterboxed to fill the canvas
    const vid = this._promoVideo;
    if (vid.readyState >= 2 && vid.videoWidth > 0) {
      const vRatio = vid.videoWidth / vid.videoHeight;
      const cRatio = vw / vh;
      let dw, dh, dx, dy;
      if (vRatio > cRatio) {
        // Video wider than canvas — fit height, crop sides
        dh = vh;
        dw = vh * vRatio;
        dx = (vw - dw) / 2;
        dy = 0;
      } else {
        // Video taller than canvas — fit width, crop top/bottom
        dw = vw;
        dh = vw / vRatio;
        dx = 0;
        dy = (vh - dh) / 2;
      }
      ctx.drawImage(vid, dx, dy, dw, dh);
    } else {
      // Video not ready yet — fallback dark background
      ctx.fillStyle = '#0a0a18';
      ctx.fillRect(0, 0, vw, vh);
    }

    // Dark gradient overlay so text stays readable
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);

    // Title
    ctx.fillStyle = '#e94560';
    ctx.font = 'bold 32px monospace';
    const title = 'BREAKOUT';
    ctx.fillText(title, vw / 2 - ctx.measureText(title).width / 2, 100);

    // Subtitle
    ctx.fillStyle = '#ddd';
    ctx.font = '10px monospace';
    const sub = 'A BEAT-EM-UP ROGUELIKE';
    ctx.fillText(sub, vw / 2 - ctx.measureText(sub).width / 2, 118);

    // Blink start prompt
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      const start = this.touchMode ? 'TAP TO START' : 'PRESS ATTACK TO START';
      ctx.fillText(start, vw / 2 - ctx.measureText(start).width / 2, 190);
    }

    // Controls hint
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '7px monospace';
    if (this.touchMode) {
      ctx.fillText('Touch controls will appear on screen', vw / 2 - 120, 255);
    } else {
      ctx.fillText('WASD/Arrows: Move  |  J/Z: Attack  |  K/X: Heavy  |  L/C: Dash  |  G: Grab  |  E: Interact', 12, 255);
    }

    // SOL price ticker (top-right)
    if (solPrice.loaded) {
      this._renderSolTicker(ctx, vw, 8);
    }
  }

  _renderSolTicker(ctx, vw, y) {
    const price = solPrice.usd.toFixed(2);
    const change = solPrice.change24h;
    const sign = change >= 0 ? '+' : '';
    const changeStr = `${sign}${change.toFixed(2)}%`;
    const isUp = change >= 0;

    // Background pill
    ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
    const pillW = 108, pillH = 20;
    const px = vw - pillW - 4, py = y;
    ctx.fillRect(px, py, pillW, pillH);
    ctx.fillStyle = isUp ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    ctx.fillRect(px, py, pillW, pillH);
    // Border
    ctx.fillStyle = isUp ? '#4ade80' : '#ef4444';
    ctx.fillRect(px, py, pillW, 1);
    ctx.fillRect(px, py + pillH - 1, pillW, 1);

    // SOL label + price
    ctx.font = 'bold 7px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('SOL', px + 4, py + 8);
    ctx.fillStyle = '#fff';
    ctx.fillText(`$${price}`, px + 24, py + 8);

    // 24h change
    ctx.fillStyle = isUp ? '#4ade80' : '#ef4444';
    ctx.font = 'bold 7px monospace';
    ctx.fillText(changeStr, px + 4, py + 16);

    // Difficulty hint
    ctx.fillStyle = '#666';
    ctx.font = '6px monospace';
    const abs = Math.abs(change);
    const diff = abs > 10 ? 'BRUTAL' : abs > 5 ? 'HARD' : abs > 2 ? 'NORMAL' : 'EASY';
    ctx.fillText(diff, px + 60, py + 16);
  }

  renderPause(ctx) {
    // Dim overlay
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, this._vw, 270);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('PAUSED', this._vw / 2 - 40, 100);

    const items = ['Resume', 'Restart'];
    ctx.font = '10px monospace';
    for (let i = 0; i < items.length; i++) {
      ctx.fillStyle = i === this.selection ? '#4ade80' : '#888';
      const prefix = i === this.selection ? '> ' : '  ';
      ctx.fillText(prefix + items[i], 200, 135 + i * 18);
    }
  }

  renderGameOver(ctx) {
    const t = this._goTimer;
    const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

    // Consistent left margin — all content left-aligned from here
    const leftX = this._vw / 2 - 85;

    // Background
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, this._vw, 270);

    // ── Phase 1: Title slam (0–0.6s) ──
    const titleAlpha = clamp01(t / 0.6);
    if (titleAlpha > 0) {
      ctx.globalAlpha = titleAlpha;

      // Red accent lines sweep in from center
      const lineW = clamp01(t / 0.4) * 120;
      ctx.fillStyle = '#e94560';
      ctx.fillRect(this._vw / 2 - lineW, 42, lineW * 2, 1);

      // Title text
      ctx.font = 'bold 24px monospace';
      const dead = 'YOU DIED';
      ctx.fillText(dead, this._vw / 2 - ctx.measureText(dead).width / 2, 62);

      // Bottom accent line
      ctx.fillRect(this._vw / 2 - lineW, 70, lineW * 2, 1);

      ctx.globalAlpha = 1;
    }

    // ── Phase 2: Enemies killed (0.8–2.5s) ──
    const ekStart = 0.8;
    const ekDur = 1.7;
    const ekAlpha = clamp01((t - ekStart) / 0.3);
    if (ekAlpha > 0) {
      ctx.globalAlpha = ekAlpha;

      const enemyColors = ['#3a4a8a', '#7a3a8a', '#5a6a8a', '#3a8a8a', '#8a6a3a', '#4a8a4a'];
      const actual = this.stats.enemiesKilled;
      const maxDisplay = Math.min(actual, 60);
      const elapsed = Math.max(0, t - ekStart);
      const progress = Math.min(1, elapsed / ekDur);
      const displayed = Math.min(maxDisplay, Math.round(progress * maxDisplay));
      const counter = Math.min(actual, Math.round(progress * actual));

      // Label + counter on same line
      ctx.fillStyle = '#888';
      ctx.font = '8px monospace';
      ctx.fillText('ENEMIES KILLED', leftX, 96);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`${counter}`, leftX + 120, 96);

      // Colored squares — left-aligned with label
      const sqSize = 8;
      const gap = 2;
      const perRow = 16;
      for (let i = 0; i < displayed; i++) {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        ctx.fillStyle = enemyColors[i % enemyColors.length];
        ctx.fillRect(leftX + col * (sqSize + gap), 104 + row * (sqSize + gap), sqSize, sqSize);
      }

      ctx.globalAlpha = 1;
    }

    // ── Phase 3: Rooms cleared (2.7–3.8s) ──
    const rcStart = 2.7;
    const rcDur = 1.1;
    const rcAlpha = clamp01((t - rcStart) / 0.3);
    if (rcAlpha > 0) {
      ctx.globalAlpha = rcAlpha;

      const actual = this.stats.roomsCleared;
      const elapsed = Math.max(0, t - rcStart);
      const progress = Math.min(1, elapsed / rcDur);
      const displayed = Math.min(actual, Math.round(progress * actual));

      // Label + counter on same line
      ctx.fillStyle = '#888';
      ctx.font = '8px monospace';
      ctx.fillText('ROOMS CLEARED', leftX, 131);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`${displayed}`, leftX + 120, 131);

      // Green room squares — left-aligned with label
      const sqSize = 8;
      const gap = 2;
      for (let i = 0; i < displayed; i++) {
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(leftX + i * (sqSize + gap), 139, sqSize, sqSize);
      }

      ctx.globalAlpha = 1;
    }

    // ── Phase 4: Floor reached (4.0–4.6s) ──
    const frStart = 4.0;
    const frAlpha = clamp01((t - frStart) / 0.3);
    if (frAlpha > 0) {
      ctx.globalAlpha = frAlpha;

      const reached = this.stats.floorReached;

      // Label + counter on same line
      ctx.fillStyle = '#888';
      ctx.font = '8px monospace';
      ctx.fillText('FLOOR REACHED', leftX, 166);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`${reached}`, leftX + 120, 166);

      // 3 bars — left-aligned with label, staggered reveal
      const barW = 40;
      const barH = 10;
      const barGap = 6;

      for (let i = 0; i < 3; i++) {
        const barDelay = frStart + i * 0.15;
        const barAlpha = clamp01((t - barDelay) / 0.2);
        if (barAlpha <= 0) continue;

        ctx.globalAlpha = frAlpha * barAlpha;
        const bx = leftX + i * (barW + barGap);
        const by = 174;

        if (i < reached) {
          // Filled — gradient red-to-orange
          const grad = ctx.createLinearGradient(bx, by, bx + barW, by);
          grad.addColorStop(0, '#e94560');
          grad.addColorStop(1, '#f0a030');
          ctx.fillStyle = grad;
          ctx.fillRect(bx, by, barW, barH);
          ctx.strokeStyle = 'rgba(233, 69, 96, 0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx - 0.5, by - 0.5, barW + 1, barH + 1);
        } else {
          // Empty — dark with border
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(bx, by, barW, barH);
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, barW - 1, barH - 1);
        }
      }

      ctx.globalAlpha = 1;
    }

    // ── Phase 5: Retry prompt (4.8s+) ──
    if (t >= 4.8) {
      const retryAlpha = clamp01((t - 4.8) / 0.4);
      const blink = t < 5.5 || Math.floor(t * 2.5) % 2 === 0;
      if (blink) {
        ctx.globalAlpha = retryAlpha;
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        const retry = this.touchMode ? 'TAP TO RETRY' : 'PRESS ATTACK TO RETRY';
        ctx.fillText(retry, this._vw / 2 - ctx.measureText(retry).width / 2, 215);
        ctx.globalAlpha = 1;
      }
    }
  }

  renderVictory(ctx) {
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, this._vw, 270);

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 20px monospace';
    const escaped = 'YOU ESCAPED';
    ctx.fillText(escaped, this._vw / 2 - ctx.measureText(escaped).width / 2, 80);

    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    ctx.fillText(`Enemies Killed: ${this.stats.enemiesKilled}`, 180, 120);
    ctx.fillText(`Rooms Cleared:  ${this.stats.roomsCleared}`, 180, 135);
    ctx.fillText(`Floor Reached:  ${this.stats.floorReached}`, 180, 150);

    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    const msg = 'BREAKOUT COMPLETE';
    ctx.fillText(msg, this._vw / 2 - ctx.measureText(msg).width / 2, 190);

    if (Math.floor(performance.now() / 500) % 2 === 0) {
      const retry = this.touchMode ? 'TAP TO PLAY AGAIN' : 'PRESS ATTACK TO PLAY AGAIN';
      ctx.fillText(retry, this._vw / 2 - ctx.measureText(retry).width / 2, 220);
    }
  }
}
