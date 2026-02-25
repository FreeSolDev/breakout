import { solPrice } from '../engine/sol-price.js';

// Swappable input label schemes — add new presets for different controllers
// Each action has `groups` (array of key-arrays) rendered as [key] / [key]
export const INPUT_SCHEMES = {
  keyboard: {
    move:     { groups: [['W','A','S','D'], ['\u2191','\u2190','\u2193','\u2192']], label: 'Move' },
    attack:   { groups: [['J'], ['Z']],           label: 'Attack' },
    heavy:    { groups: [['K'], ['X']],           label: 'Heavy' },
    dash:     { groups: [['L'], ['SPACE']],       label: 'Dash' },
    interact: { groups: [['E']],                  label: 'Pick Up' },
  },
  gamepad_xbox: {
    move:     { groups: [['LS']],  label: 'Move' },
    attack:   { groups: [['X']],   label: 'Attack' },
    heavy:    { groups: [['Y']],   label: 'Heavy' },
    dash:     { groups: [['A']],   label: 'Dash' },
    interact: { groups: [['B']],   label: 'Pick Up' },
  },
  gamepad_ps: {
    move:     { groups: [['LS']],            label: 'Move' },
    attack:   { groups: [['\u25A1']],        label: 'Attack' },
    heavy:    { groups: [['\u25B3']],        label: 'Heavy' },
    dash:     { groups: [['\u2715']],        label: 'Dash' },
    interact: { groups: [['\u25CB']],        label: 'Pick Up' },
  },
  gamepad_switch: {
    move:     { groups: [['LS']],  label: 'Move' },
    attack:   { groups: [['Y']],   label: 'Attack' },
    heavy:    { groups: [['X']],   label: 'Heavy' },
    dash:     { groups: [['B']],   label: 'Dash' },
    interact: { groups: [['A']],   label: 'Pick Up' },
  },
};

const TUTORIAL_STEPS = ['move', 'attack', 'heavy', 'dash', 'interact'];
const STEP_ACTIONS = {
  move:     ['left', 'right', 'up', 'down'],
  attack:   ['attack'],
  heavy:    ['heavy'],
  dash:     ['dash'],
  interact: ['interact'],
};

export class HUD {
  constructor() {
    this.popups = []; // { text, x, y, color, timer }
    this.banner = null; // { text, timer, maxTimer, color }

    // Tutorial system
    this._tutActive = false;
    this._tutScheme = INPUT_SCHEMES.keyboard;
    this._tutStep = 0;
    this._tutStepTimer = 0;    // time spent on current step
    this._tutFade = 0;         // 0→1 fade in
    this._tutCompleted = false;
    this._tutStepDone = false;  // player performed the action
    this._tutDoneTimer = 0;    // hold briefly after action before next step
    this._weaponPopup = null;  // { name, desc, color, timer, maxTimer }
  }

  addPopup(text, x, y, color = '#fff') {
    this.popups.push({ text, x, y, color, timer: 1.2 });
  }

  // Start the step-by-step tutorial with a given input scheme
  startTutorial(schemeName) {
    this._tutActive = true;
    this._tutScheme = INPUT_SCHEMES[schemeName] || INPUT_SCHEMES.keyboard;
    this._tutStep = 0;
    this._tutStepTimer = 0;
    this._tutFade = 0;
    this._tutCompleted = false;
    this._tutStepDone = false;
    this._tutDoneTimer = 0;
  }

  // Legacy compat — old code calls showHints()
  showHints() {
    this.startTutorial('keyboard');
  }

  showBanner(text, duration = 2.0, color = '#4ade80') {
    this.banner = { text, timer: duration, maxTimer: duration, color };
  }

  showWeaponPickup(def) {
    this._weaponPopup = {
      name: def.name,
      desc: def.desc || '',
      color: def.color,
      timer: 2.5,
      maxTimer: 2.5,
    };
  }

  update(dt, state) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].timer -= dt;
      this.popups[i].y -= 20 * dt; // float upward
      if (this.popups[i].timer <= 0) {
        this.popups.splice(i, 1);
      }
    }
    if (this.banner) {
      this.banner.timer -= dt;
      if (this.banner.timer <= 0) this.banner = null;
    }
    if (this._weaponPopup) {
      this._weaponPopup.timer -= dt;
      if (this._weaponPopup.timer <= 0) this._weaponPopup = null;
    }

    // Tutorial step advancement — frozen during cutscenes/dialogue
    if (this._tutActive && !this._tutCompleted) {
      if (state && state.cutscene && state.cutscene.active) return;

      this._tutStepTimer += dt;
      this._tutFade = Math.min(1, this._tutFade + dt * 3); // fast fade in

      const stepName = TUTORIAL_STEPS[this._tutStep];
      const actions = STEP_ACTIONS[stepName];
      const input = state && state.input;

      if (!this._tutStepDone && input) {
        // Check if the player performed the action
        for (const act of actions) {
          if (input.pressed(act) || input.isHeld(act)) {
            this._tutStepDone = true;
            this._tutDoneTimer = 0.6; // brief hold before next
            break;
          }
        }
      }

      if (this._tutStepDone) {
        this._tutDoneTimer -= dt;
        if (this._tutDoneTimer <= 0) {
          // Next step
          this._tutStep++;
          this._tutStepTimer = 0;
          this._tutFade = 0;
          this._tutStepDone = false;
          if (this._tutStep >= TUTORIAL_STEPS.length) {
            this._tutCompleted = true;
            this._tutActive = false;
          }
        }
      }
    }
  }

  render(ctx, state) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';
    ctx.globalAlpha = 1;

    const vw = state.vw || 480;
    this._vw = vw; // share with sub-methods
    const hs = state.hudScale || 1; // content scale for small screens
    this._hs = hs;
    const ecs = state.ecs;
    const playerId = state.playerId;

    // ── Status Panel (top-left) ──
    const phealth = ecs.get(playerId, 'health');
    const pcombat = ecs.get(playerId, 'combat');
    const panX = 3, panY = 2, panW = Math.round(88 * hs), panH = Math.round(26 * hs);

    // Panel background
    ctx.fillStyle = 'rgba(10, 10, 26, 0.88)';
    ctx.fillRect(panX, panY, panW, panH);

    // Beveled border (pixel-art raised panel)
    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(panX, panY, panW, 1);           // top highlight
    ctx.fillRect(panX, panY, 1, panH);           // left highlight
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(panX, panY + panH - 1, panW, 1); // bottom shadow
    ctx.fillRect(panX + panW - 1, panY, 1, panH); // right shadow

    // ── Health Row ──
    if (phealth) {
      // Red cross icon
      const crX = Math.round(panX + 4 * hs), crY = Math.round(panY + 6 * hs);
      ctx.fillStyle = '#e94560';
      ctx.fillRect(crX, crY, Math.round(5 * hs), Math.max(1, Math.round(hs)));
      ctx.fillRect(crX + Math.round(2 * hs), crY - Math.round(2 * hs), Math.max(1, Math.round(hs)), Math.round(5 * hs));

      // Health bar
      const barX = Math.round(panX + 12 * hs), barY = Math.round(panY + 4 * hs);
      const barW = Math.round(52 * hs), barH = Math.round(5 * hs);
      ctx.fillStyle = '#111';
      ctx.fillRect(barX, barY, barW, barH);

      const ratio = Math.max(0, phealth.current / phealth.max);
      const fillW = Math.max(0, barW * ratio);
      if (fillW > 0) {
        ctx.fillStyle = ratio > 0.5 ? '#4ade80' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(barX, barY, fillW, barH);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(barX, barY, fillW, 1);
      }

      // HP number
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.round(6 * hs)}px monospace`;
      ctx.fillText(`${Math.ceil(phealth.current)}`, barX + barW + 3, barY + barH);
    }

    // Separator line
    ctx.fillStyle = '#222';
    ctx.fillRect(panX + 3, Math.round(panY + 11 * hs), panW - 6, 1);

    // ── Weapon Row ──
    if (pcombat && pcombat.weapon) {
      const w = pcombat.weapon;
      const wy = Math.round(panY + 13 * hs);

      // Color swatch
      ctx.fillStyle = w.color;
      ctx.fillRect(panX + 4, wy, Math.round(3 * hs), Math.round(5 * hs));

      // Weapon name
      ctx.fillStyle = '#ccc';
      ctx.font = `${Math.round(6 * hs)}px monospace`;
      ctx.fillText(w.name, Math.round(panX + 9 * hs), wy + Math.round(5 * hs));

      // Durability bar
      const durX = Math.round(panX + 9 * hs), durY = wy + Math.round(7 * hs);
      const durW = panW - Math.round(15 * hs), durH = Math.round(2 * hs);
      const maxDur = w.maxDurability || w.durability;
      const durRatio = Math.max(0, w.durability / maxDur);
      ctx.fillStyle = '#111';
      ctx.fillRect(durX, durY, durW, durH);
      ctx.fillStyle = durRatio > 0.3 ? w.color : '#ef4444';
      ctx.fillRect(durX, durY, durW * durRatio, durH);
    } else if (pcombat) {
      ctx.fillStyle = '#555';
      ctx.font = `${Math.round(6 * hs)}px monospace`;
      ctx.fillText('FISTS', Math.round(panX + 9 * hs), Math.round(panY + 18 * hs));
    }

    // ── Floor / Room Info (top-right) ──
    const fl = state.floor;
    const cutsceneActive = state.cutscene && state.cutscene.active;
    if (fl && !cutsceneActive) {
      const room = fl.rooms[fl.currentRoomIndex];
      const roomNum = fl.currentRoomIndex + 1;
      const totalRooms = fl.rooms.length;

      // Compute wallet button height in canvas coords so we don't overlap
      let walletReserve = 0;
      const walletEl = document.getElementById('cc-header-container');
      if (walletEl) {
        const wRect = walletEl.getBoundingClientRect();
        const cRect = ctx.canvas.getBoundingClientRect();
        const cScale = cRect.height / 270;
        walletReserve = Math.ceil((wRect.bottom - cRect.top) / cScale) + 2;
      }

      // Right-side panel background (portrait: stack below status panel)
      const portrait = state.portrait;
      const rpW = Math.round(58 * hs), rpH = Math.round(18 * hs);
      const rpX = portrait ? panX : vw - rpW - 3;
      const rpY = portrait ? panY + panH + 2 : Math.max(2, walletReserve);
      ctx.fillStyle = 'rgba(10, 10, 26, 0.88)';
      ctx.fillRect(rpX, rpY, rpW, rpH);
      ctx.fillStyle = '#4a4a5a';
      ctx.fillRect(rpX, rpY, rpW, 1);
      ctx.fillRect(rpX, rpY, 1, rpH);
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(rpX, rpY + rpH - 1, rpW, 1);
      ctx.fillRect(rpX + rpW - 1, rpY, 1, rpH);

      // Floor + room number
      const text = `F${fl.floorNumber} ${roomNum}/${totalRooms}`;
      ctx.fillStyle = '#aaa';
      ctx.font = `${Math.round(7 * hs)}px monospace`;
      const tw = ctx.measureText(text).width;
      ctx.fillText(text, rpX + rpW / 2 - tw / 2, rpY + Math.round(9 * hs));

      // Room name
      ctx.fillStyle = '#555';
      ctx.font = `${Math.round(5 * hs)}px monospace`;
      const rname = room.template.name;
      const rnw = ctx.measureText(rname).width;
      ctx.fillText(rname, rpX + rpW / 2 - rnw / 2, rpY + Math.round(16 * hs));

      // Store layout info for minimap positioning
      this._portrait = !!portrait;
      this._panelBottom = rpY + rpH;

      // Room not cleared — enemies remaining warning
      if (!room.cleared) {
        const enemies = state.ecs.queryTag('enemy');
        let alive = 0;
        for (const eid of enemies) {
          const ai = state.ecs.get(eid, 'ai');
          if (ai && ai.state !== 'dead') alive++;
        }
        if (alive > 0) {
          ctx.fillStyle = '#e94560';
          ctx.font = `${Math.round(7 * hs)}px monospace`;
          ctx.fillText(`ENEMIES: ${alive}`, vw / 2 - Math.round(24 * hs), 270 - 10);
        }
      }
    }

    // --- Banner (ROOM CLEARED, etc) ---
    if (this.banner) {
      this.renderBanner(ctx);
    }

    // --- Boss health bar (top center) ---
    this.renderBossBar(ctx, state);

    // --- Minimap (top-right corner) ---
    if (fl && !cutsceneActive) {
      this.renderMinimap(ctx, fl);
    }

    // --- Weapon pickup popup ---
    this._renderWeaponPopup(ctx);

    // --- SOL price ticker (bottom-right) ---
    if (solPrice.loaded && !cutsceneActive) {
      this._renderSolTicker(ctx, vw);
    }

    ctx.restore();
  }

  _renderSolTicker(ctx, vw) {
    const price = solPrice.usd.toFixed(2);
    const change = solPrice.change24h;
    const sign = change >= 0 ? '+' : '';
    const changeStr = `${sign}${change.toFixed(2)}%`;
    const isUp = change >= 0;
    const hs = this._hs || 1;

    const pw = Math.round(70 * hs), ph = Math.round(11 * hs);
    const px = vw - pw - 3, py = 270 - ph - 3;

    ctx.fillStyle = 'rgba(10, 10, 26, 0.8)';
    ctx.fillRect(px, py, pw, ph);
    // Accent top line
    ctx.fillStyle = isUp ? '#4ade80' : '#ef4444';
    ctx.fillRect(px, py, pw, 1);

    // SOL $price
    ctx.font = `${Math.round(6 * hs)}px monospace`;
    ctx.fillStyle = '#888';
    ctx.fillText('SOL', px + 3, py + Math.round(7 * hs));
    ctx.fillStyle = '#fff';
    ctx.fillText(`$${price}`, px + 20, py + Math.round(7 * hs));

    // 24h change
    ctx.fillStyle = isUp ? '#4ade80' : '#ef4444';
    ctx.fillText(changeStr, px + 48, py + Math.round(7 * hs));
  }

  renderBossBar(ctx, state) {
    const ecs = state.ecs;
    if (!ecs) return;

    // Find active boss
    const enemies = ecs.queryTag('enemy');
    let bossId = null;
    for (const eid of enemies) {
      const ai = ecs.get(eid, 'ai');
      if (ai && ai.isBoss && ai.state !== 'dead') {
        bossId = eid;
        break;
      }
    }
    if (bossId === null) return;

    const ai = ecs.get(bossId, 'ai');
    const health = ecs.get(bossId, 'health');
    if (!ai || !health) return;

    const vw = this._vw || 480;
    const hs = this._hs || 1;
    const barW = Math.round(160 * hs);
    const barH = Math.round(8 * hs);
    const bx = vw / 2 - barW / 2;
    const by = 8;
    const ratio = Math.max(0, health.current / health.max);

    // Boss name
    const name = ai.type === 'warden' ? 'THE WARDEN' : 'COMMANDER';
    ctx.fillStyle = '#e94560';
    ctx.font = `bold ${Math.round(7 * hs)}px monospace`;
    const nameW = ctx.measureText(name).width;
    ctx.fillText(name, vw / 2 - nameW / 2 + 5, by - 1);

    // Skull icon (pixel art, left of the bar)
    const sx = bx - 12;
    const sy = by - 1;
    ctx.fillStyle = '#ddd';
    // Cranium
    ctx.fillRect(sx + 1, sy, 8, 6);
    ctx.fillRect(sx, sy + 1, 10, 4);
    // Eyes
    ctx.fillStyle = '#e94560';
    ctx.fillRect(sx + 2, sy + 2, 2, 2);
    ctx.fillRect(sx + 6, sy + 2, 2, 2);
    // Nose
    ctx.fillStyle = '#aaa';
    ctx.fillRect(sx + 4, sy + 4, 2, 1);
    // Jaw
    ctx.fillStyle = '#bbb';
    ctx.fillRect(sx + 1, sy + 6, 8, 2);
    // Teeth
    ctx.fillStyle = '#e94560';
    ctx.fillRect(sx + 2, sy + 6, 1, 2);
    ctx.fillRect(sx + 4, sy + 6, 1, 2);
    ctx.fillRect(sx + 6, sy + 6, 1, 2);

    // Bar border
    ctx.fillStyle = '#555';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    // Bar background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(bx, by, barW, barH);
    // Health fill — gradient from red to dark red
    const fillW = Math.max(0, barW * ratio);
    if (fillW > 0) {
      const grad = ctx.createLinearGradient(bx, 0, bx + fillW, 0);
      grad.addColorStop(0, '#e94560');
      grad.addColorStop(1, '#b91c3c');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, fillW, barH);
    }
    // Notches at 25% intervals
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 1; i < 4; i++) {
      ctx.fillRect(bx + barW * (i / 4), by, 1, barH);
    }
    // Phase indicator dots
    if (ai.phase !== undefined) {
      const totalPhases = ai.type === 'warden' ? 3 : 2;
      for (let i = 1; i <= totalPhases; i++) {
        const dx = bx + barW + 4 + (i - 1) * 6;
        ctx.fillStyle = i <= ai.phase ? '#e94560' : '#333';
        ctx.fillRect(dx, by + 2, 4, 4);
      }
    }
    // HP text
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(6 * hs)}px monospace`;
    ctx.fillText(`${Math.ceil(health.current)}/${health.max}`, bx + 2, by + barH - 1);
  }

  renderMinimap(ctx, floor) {
    const hs = this._hs || 1;
    const cellSize = Math.round(8 * hs);
    const gap = Math.max(1, Math.round(1 * hs));
    const mapSize = Math.round(64 * hs);
    const mapX = (this._vw || 480) - mapSize - 2;
    const mapY = (this._panelBottom || 0) + 2;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(mapX - 2, mapY - 2, mapSize + 4, mapSize + 4);

    // Find grid bounds to center the minimap
    let minGX = Infinity, minGY = Infinity, maxGX = -Infinity, maxGY = -Infinity;
    for (const room of floor.rooms) {
      minGX = Math.min(minGX, room.gridX);
      minGY = Math.min(minGY, room.gridY);
      maxGX = Math.max(maxGX, room.gridX);
      maxGY = Math.max(maxGY, room.gridY);
    }

    const gridW = maxGX - minGX + 1;
    const gridH = maxGY - minGY + 1;
    const innerSize = mapSize - 4;
    const offsetX = mapX + (innerSize - gridW * (cellSize + gap)) / 2;
    const offsetY = mapY + (innerSize - gridH * (cellSize + gap)) / 2;

    // Draw connections (only between visited rooms)
    ctx.fillStyle = '#444';
    for (const conn of floor.connections) {
      const a = floor.rooms[conn.from];
      const b = floor.rooms[conn.to];
      if (!a.visited && !b.visited) continue;
      const ax = offsetX + (a.gridX - minGX) * (cellSize + gap) + cellSize / 2;
      const ay = offsetY + (a.gridY - minGY) * (cellSize + gap) + cellSize / 2;
      const bx = offsetX + (b.gridX - minGX) * (cellSize + gap) + cellSize / 2;
      const by = offsetY + (b.gridY - minGY) * (cellSize + gap) + cellSize / 2;
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax) || 1, Math.abs(by - ay) || 1);
    }

    // Draw rooms (only visited, plus dim hints for adjacent unexplored)
    for (let i = 0; i < floor.rooms.length; i++) {
      const room = floor.rooms[i];
      if (!room.visited) continue;
      const rx = offsetX + (room.gridX - minGX) * (cellSize + gap);
      const ry = offsetY + (room.gridY - minGY) * (cellSize + gap);

      if (i === floor.currentRoomIndex) {
        ctx.fillStyle = '#4ade80'; // current room
      } else if (room.cleared) {
        ctx.fillStyle = '#555'; // cleared
      } else if (room.type === 'boss') {
        ctx.fillStyle = '#e94560'; // boss
      } else if (room.type === 'rest' || room.type === 'corridor') {
        ctx.fillStyle = '#4af'; // rest / corridor
      } else if (room.type === 'cache') {
        ctx.fillStyle = '#f59e0b'; // cache
      } else {
        ctx.fillStyle = '#333'; // visited but not cleared
      }
      ctx.fillRect(rx, ry, cellSize, cellSize);
    }
  }

  renderBanner(ctx) {
    const b = this.banner;
    const vw = this._vw || 480;
    const cx = vw / 2;
    const t = 1 - b.timer / b.maxTimer; // 0→1 progress

    // Slide in from left (first 15%), hold, then fade out (last 30%)
    let alpha = 1;
    let offsetX = 0;
    if (t < 0.15) {
      // Slide in
      const slideT = t / 0.15;
      offsetX = (1 - slideT) * -80;
      alpha = slideT;
    } else if (t > 0.7) {
      // Fade out
      alpha = 1 - (t - 0.7) / 0.3;
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    const hs = this._hs || 1;
    const cy = 135; // vertical center of 270
    const barHalf = Math.round(10 * hs);
    // Dark bar behind text
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, cy - barHalf, vw, barHalf * 2);
    // Accent lines
    ctx.fillStyle = b.color;
    ctx.fillRect(0, cy - barHalf, vw, 1);
    ctx.fillRect(0, cy + barHalf - 1, vw, 1);

    // Banner text
    ctx.font = `bold ${Math.round(10 * hs)}px monospace`;
    const textW = ctx.measureText(b.text).width;
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, cx - textW / 2 + offsetX, cy + 4);

    // Decorative chevrons
    ctx.fillStyle = b.color;
    ctx.globalAlpha = alpha * 0.4;
    const chevX = cx - textW / 2 - 14 + offsetX;
    ctx.fillRect(chevX, cy - 2, 6, 1);
    ctx.fillRect(chevX + 2, cy, 6, 1);
    ctx.fillRect(chevX, cy + 2, 6, 1);
    const chevX2 = cx + textW / 2 + 8 + offsetX;
    ctx.fillRect(chevX2, cy - 2, 6, 1);
    ctx.fillRect(chevX2 + 2, cy, 6, 1);
    ctx.fillRect(chevX2, cy + 2, 6, 1);

    ctx.restore();
  }

  _renderWeaponPopup(ctx) {
    if (!this._weaponPopup) return;

    const wp = this._weaponPopup;
    const t = 1 - wp.timer / wp.maxTimer; // 0→1 progress

    let alpha = 1;
    if (t < 0.1) alpha = t / 0.1;            // fade in
    else if (t > 0.75) alpha = 1 - (t - 0.75) / 0.25; // fade out

    ctx.save();
    ctx.globalAlpha = alpha;

    const vw = this._vw || 480;
    const hs = this._hs || 1;
    const popW = Math.round(150 * hs), popH = Math.round(28 * hs);
    const popX = vw / 2 - popW / 2, popY = 100;

    // Panel background
    ctx.fillStyle = 'rgba(10, 10, 26, 0.92)';
    ctx.fillRect(popX, popY, popW, popH);

    // Beveled border in weapon color
    ctx.fillStyle = wp.color;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillRect(popX, popY, popW, 1);
    ctx.fillRect(popX, popY, 1, popH);
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillRect(popX, popY + popH - 1, popW, 1);
    ctx.fillRect(popX + popW - 1, popY, 1, popH);
    ctx.globalAlpha = alpha;

    // Accent dashes flanking the name
    ctx.fillStyle = wp.color;
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillRect(popX + 6, popY + 11, 18, 1);
    ctx.fillRect(popX + popW - 24, popY + 11, 18, 1);
    ctx.globalAlpha = alpha;

    // Weapon name (centered)
    ctx.fillStyle = wp.color;
    ctx.font = `bold ${Math.round(9 * hs)}px monospace`;
    const name = wp.name.toUpperCase();
    const nameW = ctx.measureText(name).width;
    ctx.fillText(name, vw / 2 - nameW / 2, popY + Math.round(12 * hs));

    // Description (centered)
    ctx.fillStyle = '#aaa';
    ctx.font = `${Math.round(7 * hs)}px monospace`;
    const descW = ctx.measureText(wp.desc).width;
    ctx.fillText(wp.desc, vw / 2 - descW / 2, popY + Math.round(23 * hs));

    ctx.restore();
  }

  // Draw a single pixel-art keycap at (x, y)
  _drawKeycap(ctx, x, y, label) {
    ctx.font = '7px monospace';
    const tw = ctx.measureText(label).width;
    const kw = Math.max(14, tw + 6);
    const kh = 13;
    const kx = Math.round(x - kw / 2);
    const ky = Math.round(y - kh / 2);

    // Outer shadow
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(kx, ky + 1, kw, kh);

    // Key body
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(kx, ky, kw, kh);

    // Inner face (lighter)
    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(kx + 1, ky + 1, kw - 2, kh - 3);

    // Top highlight
    ctx.fillStyle = '#5a5a6a';
    ctx.fillRect(kx + 1, ky + 1, kw - 2, 1);

    // Letter — centered in inner face
    ctx.fillStyle = '#ddd';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, Math.round(x), Math.round(ky + (kh - 1) / 2));
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    return kw;
  }

  // Measure the total pixel width of a groups row (keycaps + gaps + "/" dividers)
  _measureGroups(ctx, groups) {
    ctx.font = '7px monospace';
    const keyGap = 2;
    const dividerW = ctx.measureText(' / ').width;
    let total = 0;
    const groupWidths = [];
    for (let g = 0; g < groups.length; g++) {
      let gw = 0;
      const kws = [];
      for (const k of groups[g]) {
        const tw = ctx.measureText(k).width;
        const kw = Math.max(14, tw + 6);
        kws.push(kw);
        gw += kw;
      }
      gw += (groups[g].length - 1) * keyGap;
      groupWidths.push({ w: gw, kws });
      total += gw;
      if (g < groups.length - 1) total += dividerW;
    }
    return { total, groupWidths, dividerW };
  }

  // Render tutorial prompts above the player (call in world-space, after lighting)
  renderTutorial(ctx, state) {
    if (!this._tutActive || this._tutCompleted) return;

    // Hide during cutscenes / dialogue
    if (state.cutscene && state.cutscene.active) return;

    const playerPos = state.ecs.get(state.playerId, 'position');
    if (!playerPos) return;

    const stepName = TUTORIAL_STEPS[this._tutStep];

    // For the interact step, also draw a glowing arrow above the nearest pickup
    if (stepName === 'interact') {
      this._renderPickupArrow(ctx, state);
    }

    const stepData = this._tutScheme[stepName];
    if (!stepData) return;

    const groups = stepData.groups;
    if (!groups || groups.length === 0) return;

    const alpha = this._tutStepDone
      ? Math.max(0, this._tutDoneTimer / 0.6)
      : this._tutFade;

    ctx.save();
    ctx.globalAlpha = alpha;

    const px = playerPos.x;
    const py = playerPos.y;
    const bob = Math.sin(performance.now() / 400) * 1.5;

    // Measure total width of all groups with "/" dividers
    const m = this._measureGroups(ctx, groups);
    const keyGap = 2;

    // Draw groups centered above player
    let cx = px - m.total / 2;
    const ky = py - 28 + bob;

    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      const gInfo = m.groupWidths[g];
      // Draw keycaps in this group
      for (let i = 0; i < grp.length; i++) {
        const kw = gInfo.kws[i];
        this._drawKeycap(ctx, cx + kw / 2, ky, grp[i]);
        cx += kw + keyGap;
      }
      cx -= keyGap; // remove trailing gap

      // Draw "/" divider between groups
      if (g < groups.length - 1) {
        ctx.font = '7px monospace';
        ctx.fillStyle = '#666';
        ctx.fillText('/', Math.round(cx + m.dividerW / 2 - ctx.measureText('/').width / 2), Math.round(ky + 3));
        cx += m.dividerW;
      }
    }

    // Action label below keycaps
    ctx.font = '7px monospace';
    const labelW = ctx.measureText(stepData.label).width;
    ctx.fillStyle = this._tutStepDone ? '#4ade80' : '#aaa';
    ctx.fillText(stepData.label, Math.round(px - labelW / 2), Math.round(ky + 14));

    ctx.restore();
  }

  _renderPickupArrow(ctx, state) {
    const playerPos = state.ecs.get(state.playerId, 'position');
    if (!playerPos) return;
    const pickups = state.ecs.queryTag('pickup');
    let nearest = null, nearestDist = Infinity;
    for (const pid of pickups) {
      const pos = state.ecs.get(pid, 'position');
      if (!pos) continue;
      const dx = pos.x - playerPos.x, dy = pos.y - playerPos.y;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) { nearestDist = d; nearest = pos; }
    }
    if (!nearest) return;

    const t = performance.now() / 1000;
    const bob = Math.sin(t * 4) * 2.5;
    const ax = Math.round(nearest.x);
    const ay = Math.round(nearest.y - 18 + bob);
    const pulse = 0.7 + 0.3 * Math.sin(t * 5);

    ctx.save();
    ctx.globalAlpha = this._tutFade * pulse;

    // Downward-pointing chevron (3 nested V shapes for a clean pixel-art look)
    ctx.fillStyle = '#e94560';
    // Top chevron row
    ctx.fillRect(ax - 4, ay,     1, 1);
    ctx.fillRect(ax + 3, ay,     1, 1);
    ctx.fillRect(ax - 3, ay + 1, 1, 1);
    ctx.fillRect(ax + 2, ay + 1, 1, 1);
    ctx.fillRect(ax - 2, ay + 2, 1, 1);
    ctx.fillRect(ax + 1, ay + 2, 1, 1);
    ctx.fillRect(ax - 1, ay + 3, 1, 1);
    ctx.fillRect(ax,     ay + 3, 1, 1);

    // Second chevron (offset down, brighter)
    ctx.fillStyle = '#ff5577';
    ctx.fillRect(ax - 4, ay + 4, 1, 1);
    ctx.fillRect(ax + 3, ay + 4, 1, 1);
    ctx.fillRect(ax - 3, ay + 5, 1, 1);
    ctx.fillRect(ax + 2, ay + 5, 1, 1);
    ctx.fillRect(ax - 2, ay + 6, 1, 1);
    ctx.fillRect(ax + 1, ay + 6, 1, 1);
    ctx.fillRect(ax - 1, ay + 7, 1, 1);
    ctx.fillRect(ax,     ay + 7, 1, 1);

    // Third chevron (brightest, bottom)
    ctx.fillStyle = '#ff8899';
    ctx.fillRect(ax - 4, ay + 8, 1, 1);
    ctx.fillRect(ax + 3, ay + 8, 1, 1);
    ctx.fillRect(ax - 3, ay + 9, 1, 1);
    ctx.fillRect(ax + 2, ay + 9, 1, 1);
    ctx.fillRect(ax - 2, ay + 10, 1, 1);
    ctx.fillRect(ax + 1, ay + 10, 1, 1);
    ctx.fillRect(ax - 1, ay + 11, 1, 1);
    ctx.fillRect(ax,     ay + 11, 1, 1);

    ctx.restore();
  }

  renderPopups(ctx, camera) {
    for (const popup of this.popups) {
      const alpha = Math.min(1, popup.timer / 0.3);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = popup.color;
      ctx.font = 'bold 8px monospace';
      ctx.fillText(popup.text, Math.round(popup.x - ctx.measureText(popup.text).width / 2), Math.round(popup.y));
      ctx.globalAlpha = 1;
    }
  }
}
