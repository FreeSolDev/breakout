export class Input {
  constructor(canvas) {
    this._canvas = canvas;
    this.actions = {
      left: false, right: false, up: false, down: false,
      attack: false, heavy: false, dash: false,
      grab: false, interact: false, pause: false
    };
    this.held = {};
    this._pressed = {};
    this._released = {};
    this._kbHeld = {};   // keyboard-only held state
    this._gpHeld = {};   // gamepad-only held state
    this._touchHeld = {}; // touch-only held state
    this._keyMap = {
      'KeyA': 'left', 'ArrowLeft': 'left',
      'KeyD': 'right', 'ArrowRight': 'right',
      'KeyW': 'up', 'ArrowUp': 'up',
      'KeyS': 'down', 'ArrowDown': 'down',
      'KeyJ': 'attack', 'KeyZ': 'attack',
      'KeyK': 'heavy', 'KeyX': 'heavy',
      'Space': 'dash', 'KeyL': 'dash',
      'KeyI': 'grab', 'KeyC': 'grab', 'KeyG': 'grab',
      'KeyE': 'interact',
      'Escape': 'pause'
    };

    window.addEventListener('keydown', (e) => {
      const action = this._keyMap[e.code];
      if (action && !this.held[action]) {
        this._pressed[action] = true;
      }
      if (action) {
        this._kbHeld[action] = true;
        this.held[action] = true;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      const action = this._keyMap[e.code];
      if (action) {
        this._kbHeld[action] = false;
        this.held[action] = !!this._gpHeld[action] || !!this._touchHeld[action];
        this._released[action] = true;
      }
    });

    // Clear stuck keys when window loses focus
    window.addEventListener('blur', () => {
      for (const key in this._kbHeld) this._kbHeld[key] = false;
      for (const key in this.held) {
        this.held[key] = !!this._gpHeld[key] || !!this._touchHeld[key];
      }
    });

    // ─── Touch controls ───
    this._touchVisible = false;
    this._dpadTouch = null;       // active touch identifier for D-pad
    this._btnTouches = {};        // action → touch identifier
    this._dpadCenter = { x: 50, y: 215 };   // default visual position
    this._dpadOrigin = null;      // floating: where the thumb landed
    this._dpadRadius = 32;
    this._dpadAngle = null;       // current D-pad angle (for rendering)
    this._dpadDist = 0;           // current drag distance (for rendering)
    this._vw = 480; // virtual width, updated by resizeDisplay
    this._touchButtons = [
      { rx: 50, y: 235, r: 18, action: 'attack', label: 'J', color: '#e94560' },
      { rx: 20, y: 208, r: 15, action: 'heavy',  label: 'K', color: '#f59e0b' },
      { rx: 80, y: 208, r: 15, action: 'dash',   label: 'L', color: '#38bdf8' },
      { rx: 50, y: 181, r: 13, action: 'interact',label: 'E', color: '#4ade80' },
    ];
    this._updateTouchLayout(480);

    // Touch device detection (iPad reports as Mac but has touch)
    this._isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Tap zone — when set, taps in this rect fire attack (dialogue advance, title start, etc.)
    this._dialogueTapZone = null; // { x, y, w, h }

    // Wallet button tap zone — when set, taps here set _walletTapped flag
    this._walletTapZone = null; // { x, y, w, h }
    this._walletTapped = false;

    // HUD panel tap zone — for collapsible portrait HUD
    this._hudPanelTapZone = null; // { x, y, w, h }
    this._hudPanelTapped = false;

    if (canvas) {
      canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
      canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
      canvas.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
      canvas.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: false });
      // Mouse click for wallet button + HUD panel toggle (desktop portrait mode)
      canvas.addEventListener('click', (e) => {
        const rect = this._canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (this._vw / rect.width);
        const py = (e.clientY - rect.top) * (270 / rect.height);
        if (this._hudPanelTapZone) {
          const z = this._hudPanelTapZone;
          if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) {
            this._hudPanelTapped = true;
            return;
          }
        }
        if (this._walletTapZone) {
          const z = this._walletTapZone;
          if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) {
            this._walletTapped = true;
          }
        }
      });
    }
  }

  pressed(action) { return !!this._pressed[action]; }
  isHeld(action) { return !!this.held[action]; }
  released(action) { return !!this._released[action]; }

  getAxis() {
    let x = 0, y = 0;
    if (this.held.left) x -= 1;
    if (this.held.right) x += 1;
    if (this.held.up) y -= 1;
    if (this.held.down) y += 1;
    // Normalize diagonal
    if (x !== 0 && y !== 0) {
      const len = Math.sqrt(x * x + y * y);
      x /= len; y /= len;
    }
    return { x, y };
  }

  endFrame() {
    this._pressed = {};
    this._released = {};
  }

  // Gamepad polling (call in update)
  pollGamepad() {
    const gp = navigator.getGamepads()[0];
    if (!gp) return;
    const dz = 0.25;

    // Compute fresh stick direction state each frame
    const lx = gp.axes[0];
    const ly = gp.axes[1];
    const dirs = {
      left: lx < -dz,
      right: lx > dz,
      up: ly < -dz,
      down: ly > dz,
    };

    // Merge: held = keyboard OR gamepad OR touch
    for (const dir of ['left', 'right', 'up', 'down']) {
      this._gpHeld[dir] = dirs[dir];
      this.held[dir] = dirs[dir] || !!this._kbHeld[dir] || !!this._touchHeld[dir];
    }

    // Buttons — only fire _pressed on initial press, not every held frame
    const gpButtons = {
      dash: gp.buttons[0]?.pressed,
      attack: gp.buttons[2]?.pressed,
      heavy: gp.buttons[3]?.pressed,
      grab: gp.buttons[1]?.pressed,
      pause: gp.buttons[9]?.pressed,
    };
    for (const [action, pressed] of Object.entries(gpButtons)) {
      if (pressed && !this._gpHeld[action]) {
        this._pressed[action] = true;
      }
      this._gpHeld[action] = !!pressed;
    }
  }

  // ─── Touch input ───

  _updateTouchLayout(vw, scale, portrait) {
    this._vw = vw;
    this._touchScale = scale || 1;
    this._portrait = !!portrait;
    const s = this._touchScale;
    const gap = Math.round(4 * s);

    // Layout action buttons from bottom, spaced by scaled radii so they never overlap
    // Scale rx offsets too so buttons don't clip off the right edge
    const btns = this._touchButtons;
    const atkR = Math.round(btns[0].r * s);
    // In portrait, push buttons up to clear SOL ticker at the bottom
    const bottomEdge = this._portrait ? 248 : 270;
    btns[0].x = vw - Math.round(btns[0].rx * s);
    btns[0].y = bottomEdge - atkR - gap;

    const midR = Math.round(btns[1].r * s);
    const midY = btns[0].y - atkR - midR - gap;
    btns[1].x = vw - Math.round(btns[1].rx * s);
    btns[1].y = midY;
    btns[2].x = vw - Math.round(btns[2].rx * s);
    btns[2].y = midY;

    const topR = Math.round(btns[3].r * s);
    btns[3].x = vw - Math.round(btns[3].rx * s);
    btns[3].y = midY - midR - topR - gap;

    // In portrait, clamp buttons so they don't overlap the D-pad zone
    if (this._portrait) {
      const minX = this._vw * 0.38 + 10;
      for (const btn of btns) {
        const br = Math.round(btn.r * s);
        if (btn.x - br < minX) {
          btn.x = minX + br;
        }
      }
    }

    this._dpadRadius = Math.round(32 * s);
    // Center D-pad vertically to match button cluster
    this._dpadCenter.x = this._portrait ? Math.round(vw * 0.19) : 50;
    this._dpadCenter.y = Math.round(midY);
  }

  _touchToCanvas(touch) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) * (this._vw / rect.width),
      y: (touch.clientY - rect.top) * (270 / rect.height),
    };
  }

  setDialogueTapZone(zone) {
    this._dialogueTapZone = zone;
  }

  _onTouchStart(e) {
    e.preventDefault();
    this._touchVisible = true;
    for (let t = 0; t < e.changedTouches.length; t++) {
      const touch = e.changedTouches[t];
      const p = this._touchToCanvas(touch);

      // Dialogue tap zone — tap anywhere on the dialogue box to advance
      if (this._dialogueTapZone) {
        const z = this._dialogueTapZone;
        if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) {
          this._pressed.attack = true;
          continue;
        }
      }

      // Wallet button tap zone (check before panel — wallet is inside panel area)
      if (this._walletTapZone) {
        const z = this._walletTapZone;
        if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) {
          this._walletTapped = true;
          continue;
        }
      }

      // HUD panel tap zone (collapsible portrait HUD)
      if (this._hudPanelTapZone) {
        const z = this._hudPanelTapZone;
        if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) {
          this._hudPanelTapped = true;
          continue;
        }
      }

      // Floating D-pad — touch anywhere on left side of screen
      const dpadZone = this._portrait ? this._vw * 0.38 : 150;
      if (p.x < dpadZone && this._dpadTouch === null) {
        this._dpadTouch = touch.identifier;
        this._dpadOrigin = { x: p.x, y: p.y };
        this._dpadAngle = null;
        this._dpadDist = 0;
        continue;
      }

      // Check action buttons
      for (const btn of this._touchButtons) {
        const bx = p.x - btn.x;
        const by = p.y - btn.y;
        const hitR = btn.r * 1.6 * (this._touchScale || 1); // generous hit area, scaled for small screens
        if (bx * bx + by * by < hitR * hitR) {
          this._btnTouches[btn.action] = touch.identifier;
          if (!this.held[btn.action]) this._pressed[btn.action] = true;
          this._touchHeld[btn.action] = true;
          this.held[btn.action] = true;
          break;
        }
      }
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    for (let t = 0; t < e.changedTouches.length; t++) {
      const touch = e.changedTouches[t];
      if (touch.identifier === this._dpadTouch) {
        const p = this._touchToCanvas(touch);
        this._updateDpad(p);
      }
    }
  }

  _onTouchEnd(e) {
    for (let t = 0; t < e.changedTouches.length; t++) {
      const touch = e.changedTouches[t];

      // D-pad released
      if (touch.identifier === this._dpadTouch) {
        this._dpadTouch = null;
        this._dpadOrigin = null;
        this._dpadAngle = null;
        this._dpadDist = 0;
        for (const dir of ['left', 'right', 'up', 'down']) {
          if (this._touchHeld[dir]) {
            this._touchHeld[dir] = false;
            this.held[dir] = !!this._kbHeld[dir] || !!this._gpHeld[dir];
            this._released[dir] = true;
          }
        }
      }

      // Button released
      for (const btn of this._touchButtons) {
        if (this._btnTouches[btn.action] === touch.identifier) {
          delete this._btnTouches[btn.action];
          this._touchHeld[btn.action] = false;
          this.held[btn.action] = !!this._kbHeld[btn.action] || !!this._gpHeld[btn.action];
          this._released[btn.action] = true;
        }
      }
    }
  }

  _updateDpad(p) {
    const origin = this._dpadOrigin || this._dpadCenter;
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this._dpadDist = dist;

    const newDirs = { left: false, right: false, up: false, down: false };
    if (dist > 10) { // deadzone — large enough to ignore finger jitter
      this._dpadAngle = Math.atan2(dy, dx);
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      // Dominant-axis detection — cardinals get ~60° zones, diagonals ~30°
      // This makes it much easier to walk in a straight line
      const ratio = 1.8;
      if (adx > ady * ratio) {
        // Pure horizontal
        if (dx < 0) newDirs.left = true; else newDirs.right = true;
      } else if (ady > adx * ratio) {
        // Pure vertical
        if (dy < 0) newDirs.up = true; else newDirs.down = true;
      } else {
        // Diagonal — both axes active
        if (dx < 0) newDirs.left = true; else newDirs.right = true;
        if (dy < 0) newDirs.up = true; else newDirs.down = true;
      }
    } else {
      this._dpadAngle = null;
    }

    for (const dir of ['left', 'right', 'up', 'down']) {
      const was = !!this._touchHeld[dir];
      this._touchHeld[dir] = newDirs[dir];
      if (newDirs[dir] && !was) this._pressed[dir] = true;
      if (!newDirs[dir] && was) this._released[dir] = true;
      this.held[dir] = newDirs[dir] || !!this._kbHeld[dir] || !!this._gpHeld[dir];
    }
  }

  // ─── Touch controls rendering (screen space) ───

  renderTouch(ctx) {
    if (!this._touchVisible) return;

    ctx.save();

    const tsc = this._touchScale || 1;
    // On small portrait screens (low touch scale), slightly dim idle controls
    const small = tsc < 0.85;
    const idleDim = small ? 0.75 : 1; // multiplier for idle alpha values

    // ── D-pad (floating joystick) ──
    const dpadActive = this._dpadTouch !== null && this._dpadOrigin;
    const dp = dpadActive ? this._dpadOrigin : this._dpadCenter;
    const dr = this._dpadRadius;

    // On small screens, hide d-pad entirely when idle — it appears on touch
    if (dpadActive || !small) {
      // Base ring
      ctx.globalAlpha = dpadActive ? 0.25 : 0.15 * idleDim;
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, dr, 0, Math.PI * 2);
      ctx.stroke();

      // Inner deadzone dot
      ctx.globalAlpha = dpadActive ? 0.2 : 0.1 * idleDim;
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Direction arrows at cardinal positions
      const arrowDist = dr * 0.65;
      const arrowSize = Math.round(5 * tsc);
      const arrows = [
        { dir: 'up',    ax: 0, ay: -1 },
        { dir: 'down',  ax: 0, ay: 1 },
        { dir: 'left',  ax: -1, ay: 0 },
        { dir: 'right', ax: 1, ay: 0 },
      ];
      for (const arr of arrows) {
        const active = !!this._touchHeld[arr.dir];
        ctx.globalAlpha = active ? 0.7 : 0.2 * idleDim;
        ctx.fillStyle = active ? '#fff' : '#999';
        const cx = dp.x + arr.ax * arrowDist;
        const cy = dp.y + arr.ay * arrowDist;
        ctx.beginPath();
        ctx.moveTo(cx + arr.ax * arrowSize, cy + arr.ay * arrowSize);
        ctx.lineTo(cx + arr.ay * arrowSize * 0.6, cy - arr.ax * arrowSize * 0.6);
        ctx.lineTo(cx - arr.ay * arrowSize * 0.6, cy + arr.ax * arrowSize * 0.6);
        ctx.fill();
      }
    }

    // Thumb knob — follows finger direction, clamped to ring radius
    if (dpadActive && this._dpadAngle !== null) {
      const knobDist = Math.min(this._dpadDist, dr * 0.7);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ccc';
      ctx.beginPath();
      ctx.arc(
        dp.x + Math.cos(this._dpadAngle) * knobDist,
        dp.y + Math.sin(this._dpadAngle) * knobDist,
        Math.round(8 * tsc), 0, Math.PI * 2
      );
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(
        dp.x + Math.cos(this._dpadAngle) * knobDist,
        dp.y + Math.sin(this._dpadAngle) * knobDist,
        Math.round(4 * tsc), 0, Math.PI * 2
      );
      ctx.fill();
    }

    // ── Action buttons ──
    const ts = tsc;
    for (const btn of this._touchButtons) {
      const active = !!this._touchHeld[btn.action];
      const br = Math.round(btn.r * ts);

      // Button circle
      ctx.globalAlpha = active ? 0.5 : 0.18 * idleDim;
      ctx.fillStyle = btn.color;
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, br, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.globalAlpha = active ? 0.7 : 0.35 * idleDim;
      ctx.strokeStyle = btn.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, br, 0, Math.PI * 2);
      ctx.stroke();

      // Label
      ctx.globalAlpha = active ? 0.9 : 0.45 * idleDim;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(6 * ts)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x, btn.y);
    }

    ctx.restore();
  }
}
