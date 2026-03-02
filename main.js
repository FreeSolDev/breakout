import { Game } from './engine/game.js';
import { Input } from './engine/input.js';
import { Camera } from './engine/camera.js';
import { ECS } from './engine/ecs.js';
import { ParticleSystem } from './engine/particles.js';
import { createPlayer } from './entities/player.js';
import { MovementSystem } from './systems/movement.js';
import { CombatSystem } from './systems/combat.js';
import { JuiceSystem } from './systems/juice.js';
import { AISystem } from './systems/ai.js';
import { WEAPON_DEFS } from './entities/weapons.js';
import { DestructionSystem } from './systems/destruction.js';
import { FireSystem } from './systems/fire.js';
import { LightingSystem } from './systems/lighting.js';
import { EntityCollisionSystem } from './systems/entity-collision.js';
import { Floor } from './world/floor-gen.js';
import { HUD } from './ui/hud.js';
import { MenuSystem } from './ui/menus.js';
import { CutsceneEngine } from './cutscene/cutscene-engine.js';
import { DialogueBox } from './cutscene/dialogue-box.js';
import { SCRIPTS } from './cutscene/scripts/all-scripts.js';
import { AudioSystem } from './engine/audio.js';
import { PostProcess } from './engine/postprocess.js';
import { BloodPoolSystem } from './engine/blood-pools.js';
import { loadAllSprites, drawSprite, drawPickupSprite, drawEquippedWeapon } from './engine/character-sprites.js';
import { loadHitEffects, spawnHitEffect, hitboxToEffectType, updateHitEffects, drawHitEffects, clearHitEffects } from './engine/hit-effects.js';
import { solPrice, fetchSolPrice, updateSolPrice } from './engine/sol-price.js';
import { loadDecorTiles, getDirtTile, getFloraTile, getAlienTile, decorLoaded } from './engine/decor-sprites.js';

const TILE = 16;

// Dynamic virtual dimensions — zoom in on small screens, fill aspect ratio
const _initVV = window.visualViewport;
const _initSW = _initVV ? _initVV.width : window.innerWidth;
const _initSH = _initVV ? _initVV.height : window.innerHeight;
const _initShort = Math.min(_initSW, _initSH);
let _vh = _initShort < 600 ? Math.max(160, Math.round(270 * _initShort / 600)) : 270;
let _vw = Math.ceil(_vh * (_initSW / _initSH));
let _hvw = Math.ceil(270 * (_initSW / _initSH)); // HUD virtual width (always 270 height)
let _hudContentScale = _initShort < 600 ? Math.min(1.3, 600 / _initShort) : 1;
let _isPortrait = _initSW < _initSH;

const canvas = document.getElementById('game');
const game = new Game(canvas, _vw, _vh);

// ─── HUD overlay canvas (native resolution for crisp text) ───
const hudCanvas = document.getElementById('hud-overlay');
const hudCtx = hudCanvas.getContext('2d');
let _hudScale = 1;

// Pre-rendered fog brush — created once, stamped via drawImage instead of
// calling createRadialGradient 6-10 times per frame
let _fogBrushCanvas = null;
function _getFogBrush() {
  if (_fogBrushCanvas) return _fogBrushCanvas;
  const sz = 128;
  _fogBrushCanvas = document.createElement('canvas');
  _fogBrushCanvas.width = sz;
  _fogBrushCanvas.height = sz;
  const fc = _fogBrushCanvas.getContext('2d');
  const half = sz / 2;
  const grad = fc.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(200, 215, 235, 0.025)');
  grad.addColorStop(0.25, 'rgba(190, 210, 230, 0.017)');
  grad.addColorStop(0.5, 'rgba(180, 200, 220, 0.008)');
  grad.addColorStop(0.75, 'rgba(170, 190, 210, 0.003)');
  grad.addColorStop(1, 'rgba(160, 180, 200, 0)');
  fc.fillStyle = grad;
  fc.fillRect(0, 0, sz, sz);
  return _fogBrushCanvas;
}

// Shared singletons
const input = new Input(canvas);
const camera = new Camera(_vw, _vh);
const particles = new ParticleSystem();
const lighting = new LightingSystem(_vw, _vh);
const hud = new HUD();
const menus = new MenuSystem();
const cutscene = new CutsceneEngine();
const dialogueBox = new DialogueBox();
cutscene.dialogue = dialogueBox;
const audio = new AudioSystem();
const postprocess = new PostProcess(_vw, _vh);
const bloodPools = new BloodPoolSystem();

// ─── Wallet (Jupiter only) ───
const wallet = new window.CryptoClient({
  apiKey: '0729bdf4-4a47-44aa-8772-d842d023bc1b',
  appName: 'Breakout'
});
wallet.init();

// ─── Responsive resize (fills screen, zooms on small screens) ───
function resizeDisplay() {
  const vv = window.visualViewport;
  const screenW = Math.floor(vv ? vv.width : window.innerWidth);
  const screenH = Math.floor(vv ? vv.height : window.innerHeight);

  // Dynamic virtual height — small screens get fewer virtual pixels = zoom
  const shortDim = Math.min(screenW, screenH);
  _vh = shortDim < 600 ? Math.max(200, Math.round(270 * shortDim / 400)) : 270;

  // Game virtual size (aspect-matched, height controls zoom)
  _vw = Math.ceil(_vh * (screenW / screenH));

  // HUD virtual size (always 270 height, width matches screen aspect ratio)
  _hvw = Math.ceil(270 * (screenW / screenH));

  // Portrait detection (phone held upright — width < height)
  _isPortrait = screenW < screenH;

  // Resize game canvas
  canvas.width = _vw;
  canvas.height = _vh;
  game.ctx.imageSmoothingEnabled = false;
  game.width = _vw;
  game.height = _vh;

  // Update subsystems with game dimensions
  camera.width = _vw;
  camera.height = _vh;
  lighting.resize(_vw, _vh);
  postprocess.resize(_vw, _vh);

  // Scale HUD elements on small screens (buttons, fonts)
  _hudContentScale = shortDim < 600 ? Math.min(1.3, 600 / shortDim) : 1;
  // Touch buttons use a smaller scale on narrow portrait screens so they don't dominate
  const touchScale = (_isPortrait && shortDim < 500) ? Math.max(0.7, shortDim / 600) : _hudContentScale;
  input._updateTouchLayout(_hvw, touchScale, _isPortrait); // touch uses HUD coords

  // Wrap fills screen directly (no CSS transform needed)
  const wrap = document.getElementById('game-wrap');
  wrap.style.width = screenW + 'px';
  wrap.style.height = screenH + 'px';
  wrap.style.transform = '';

  // HUD at native resolution (dpr × screen size)
  const dpr = window.devicePixelRatio || 1;
  hudCanvas.width = Math.round(screenW * dpr);
  hudCanvas.height = Math.round(screenH * dpr);
  _hudScale = hudCanvas.width / _hvw;

  // Share HUD virtual width and content scale with UI systems
  game.state.vw = _hvw;
  game.state.hudScale = _hudContentScale;
  game.state.portrait = _isPortrait;
}
window.addEventListener('resize', resizeDisplay);
window.addEventListener('orientationchange', () => setTimeout(resizeDisplay, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeDisplay);
resizeDisplay();

// Systems
const movementSystem = new MovementSystem();
const combatSystem = new CombatSystem();
const juiceSystem = new JuiceSystem();
const aiSystem = new AISystem();
const entityCollisionSystem = new EntityCollisionSystem();
const destructionSystem = new DestructionSystem();
const fireSystem = new FireSystem();

function initGame() {
  const ecs = new ECS();
  game.state = {};
  game.state.input = input;
  game.state.camera = camera;
  game.state.ecs = ecs;
  game.state.particles = particles;
  game.state.lighting = lighting;
  game.state.combatSystem = combatSystem;
  game.state.juice = juiceSystem;
  game.state.hud = hud;
  game.state.menus = menus;
  game.state.cutscene = cutscene;
  game.state.audio = audio;
  game.state.postprocess = postprocess;
  game.state.bloodPools = bloodPools;
  game.state.fireSystem = fireSystem;
  game.state.wallet = wallet;
  game.state.hudCtx = hudCtx;
  game.state.vw = _hvw;
  game.state.hudScale = _hudContentScale;
  game.state.portrait = _isPortrait;

  // Reset systems
  combatSystem.activeHitboxes = [];
  juiceSystem.hitstopFrames = 0;
  juiceSystem.flashEntities.clear();
  juiceSystem.impacts = [];
  particles.particles = [];
  lighting.clear();
  bloodPools.clear();
  fireSystem.clear();

  // Spawn player
  const playerId = createPlayer(ecs, 0, 0);
  game.state.playerId = playerId;

  // Generate floor
  const floor = new Floor(1);
  floor.generate();
  game.state.floor = floor;
  floor.loadRoom(0, game.state, null);

  // Reset menu stats
  menus.stats = { enemiesKilled: 0, roomsCleared: 0, floorReached: 1 };
  menus.fadeAlpha = 0;

  // Cutscene flags (one-time triggers)
  game.state.cutsceneFlags = { firstEnemy: false, bossIntro: {} };
  game.state._scripts = SCRIPTS;

  // Game start cutscene plays after title screen is dismissed
  game.state._pendingStartCutscene = true;
  game.state.timeScale = 1;
}

initGame();

// ─── SOL price polling ───
game.addSystem({
  update(dt) { updateSolPrice(dt); }
});

// ─── Input polling (also runs during hitstop) ───
game.addSystem({
  update(dt, state) {
    state.input.pollGamepad();

    // Sync HUD tap zones
    state.input._walletTapZone = state.hud._walletBtn || null;
    state.input._hudPanelTapZone = state.hud._panelTapZone || null;

    // Handle wallet button tap (check first — wallet zone is inside panel zone)
    if (state.input._walletTapped) {
      state.input._walletTapped = false;
      state.input._hudPanelTapped = false; // don't also toggle panel
      if (state.wallet) state.wallet.showOverlay();
      state.hud._expandTimer = 4; // reset auto-collapse timer
    }

    // Handle HUD panel tap (toggle collapse/expand)
    if (state.input._hudPanelTapped) {
      state.input._hudPanelTapped = false;
      const hud = state.hud;
      hud._collapsed = !hud._collapsed;
      if (!hud._collapsed) hud._expandTimer = 4; // auto-collapse after 4s
    }
  },
  hitstopUpdate(dt, state) {
    state.input.pollGamepad();
  }
});

// ─── Menu system (runs first, blocks game when active) ───
game.addSystem({
  update(dt, state) {
    // Detect touch device for menu prompts (iPad reports as Mac but has touch points)
    state.menus.touchMode = state.input._isTouchDevice || state.input._touchVisible;

    // Full-screen tap zone for title/gameover/victory screens
    const menu = state.menus.currentMenu;
    if (menu === 'title' || menu === 'gameover' || menu === 'victory') {
      state.input.setDialogueTapZone({ x: 0, y: 0, w: _hvw, h: 270 });
    }

    const result = state.menus.update(dt, state);
    if (result === 'restart') {
      initGame();
      state.menus.currentMenu = 'none';
      state.timeScale = 1;
      return;
    }
    const wasMenuBlocking = state._menuBlocking;
    state._menuBlocking = !!result;

    // Just started blocking (death, pause, gameover) — clear lingering combat visuals
    if (state._menuBlocking && !wasMenuBlocking) {
      clearHitEffects();
      if (state.combatSystem) state.combatSystem.activeHitboxes.length = 0;
    }

    // Clear tap zone when entering gameplay
    if (state.menus.currentMenu === 'none') {
      state.input.setDialogueTapZone(null);
    }

    // Trigger game start cutscene after title screen is dismissed
    if (state._pendingStartCutscene && state.menus.currentMenu === 'none') {
      state._pendingStartCutscene = false;
      state.cutscene.play(SCRIPTS.game_start, state);
      state.hud.showHints();
    }
  },
  hitstopUpdate(dt, state) {
    state.input.pollGamepad();
  }
});

// ─── Cutscene system (blocks game updates when active) ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking) {
      state._cutsceneBlocking = false;
      return;
    }
    if (state.cutscene.active) {
      state.cutscene.update(dt, state);
      if (!state._cutsceneBlocking) {
        // Just entered cutscene — clear lingering combat visuals
        clearHitEffects();
        if (state.combatSystem) state.combatSystem.activeHitboxes.length = 0;
      }
      state._cutsceneBlocking = true;
      // Enable dialogue tap zone for mobile when dialogue is visible
      if (dialogueBox.visible) {
        dialogueBox.touchMode = !!state.input._touchVisible;
        state.input.setDialogueTapZone({ x: dialogueBox.boxX, y: dialogueBox.boxY, w: dialogueBox.boxW, h: dialogueBox.boxH });
      } else {
        state.input.setDialogueTapZone(null);
      }
    } else {
      state._cutsceneBlocking = false;
      state.input.setDialogueTapZone(null);
    }
  }
});

// ─── Combat ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking || state._cutsceneBlocking) return;
    combatSystem.update(dt, state);
  }
});

// ─── Hit Effects ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking || state._cutsceneBlocking) return;
    if (state.hitEvents) {
      for (const ev of state.hitEvents) {
        if (!ev.position) continue;
        spawnHitEffect(hitboxToEffectType(ev.hitbox), ev.position.x, ev.position.y);
      }
    }
    updateHitEffects(dt);
  }
});

// ─── Deferred hitbox spawning ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking || state._cutsceneBlocking) return;
    const player = state.ecs.get(state.playerId, 'player');
    const pos = state.ecs.get(state.playerId, 'position');
    const combat = state.ecs.get(state.playerId, 'combat');
    if (player && player._spawnHitboxNextFrame) {
      player._spawnHitboxNextFrame = false;
      state.combatSystem.spawnHitbox(state.playerId, pos, player, combat, state);
    }
  }
});

// ─── Destruction ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking || state._cutsceneBlocking) return;
    destructionSystem.update(dt, state);
  }
});

// ─── Fire hazards ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking || state._cutsceneBlocking) return;
    fireSystem.update(dt, state);
  }
});

// ─── AI ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking || state._cutsceneBlocking) return;
    aiSystem.update(dt, state);

    // First enemy encounter cutscene
    if (!state.cutsceneFlags.firstEnemy) {
      const enemies = state.ecs.queryTag('enemy');
      for (const eid of enemies) {
        const ai = state.ecs.get(eid, 'ai');
        if (ai && ai.state === 'chase' && ai.type === 'security_guard') {
          state.cutsceneFlags.firstEnemy = true;
          state.cutscene.play(SCRIPTS.first_enemy, state);
          break;
        }
      }
    }
  }
});

// ─── Movement ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking || state._cutsceneBlocking) return;
    movementSystem.update(dt, state);
  }
});

// ─── Entity collision pushback ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking || state._cutsceneBlocking) return;
    entityCollisionSystem.update(dt, state);
  }
});

// ─── Door transitions ───
game.addSystem({
  update(dt, state) {
    if (state._menuBlocking || state._cutsceneBlocking) return;
    const fl = state.floor;
    if (!fl) return;

    if (fl.transitioning) {
      if (fl.transitionPhase === 'load') {
        fireSystem.clear();
        if (hud._tutShowDoorArrow) hud._tutShowDoorArrow = false;
      }
      fl.updateTransition(dt, state);
    } else {
      // Detect room clear moment
      if (fl.checkRoomCleared(state)) {
        state.hud.showBanner('ROOM CLEARED', 2.0, '#4ade80');
        if (state.camera) state.camera.shake(3, 0.15);
        if (state.audio) state.audio.playMenuConfirm();
      }
      fl.checkDoorTransition(state);
    }
  }
});

// ─── HUD update (popups) ───
game.addSystem({
  update(dt, state) {
    state.hud.update(dt, state);
  }
});

// ─── Camera follow ───
game.addSystem({
  update(dt, state) {
    const pos = state.ecs.get(state.playerId, 'position');
    if (pos) state.camera.follow(pos.x, pos.y);
    state.camera.update(dt);
  },
  hitstopUpdate(dt, state) {
    state.camera.update(dt);
  }
});

// ─── Particles + Lighting ───
game.addSystem({
  update(dt, state) {
    state.particles.update(dt);
    state.lighting.update(dt);
    state.postprocess.update(dt);
    state.bloodPools.update(dt);
  }
});

// ─── Static layer builder ───
function _buildStaticLayer(state) {
  const tilemap = state.tilemap;
  const c = document.createElement('canvas');
  c.width = tilemap.width * TILE;
  c.height = tilemap.height * TILE;
  const sctx = c.getContext('2d');

  // Floor checkerboard
  for (let y = 0; y < tilemap.height; y++) {
    for (let x = 0; x < tilemap.width; x++) {
      if (!tilemap.isSolid(x, y)) {
        sctx.fillStyle = (x + y) % 2 === 0 ? '#16213e' : '#1a1a2e';
        sctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  // Underground dirt/flora/alien patches (drawn on floor, below wires and walls)
  if (decorLoaded() && state.groundPatches && state.groundPatches.length > 0) {
    for (const patch of state.groundPatches) {
      let img;
      if (patch.type === 'dirt') img = getDirtTile(patch.tileIndex);
      else if (patch.type === 'alien') img = getAlienTile(patch.tileIndex);
      else img = getFloraTile(patch.tileIndex);
      if (!img) continue;
      sctx.save();
      sctx.globalAlpha = patch.alpha;
      sctx.drawImage(img, patch.x, patch.y, TILE, TILE);
      sctx.restore();
    }
  }

  // Wire glow + core strokes
  if (state.wires && state.wires.length > 0) {
    for (const wire of state.wires) {
      const pts = wire.points;
      if (pts.length < 2) continue;
      // Glow pass
      sctx.save();
      sctx.globalAlpha = 0.15;
      sctx.strokeStyle = '#0f0';
      sctx.lineWidth = 4;
      sctx.beginPath();
      sctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        const cpx = (prev.x + cur.x) / 2;
        const cpy = (prev.y + cur.y) / 2;
        sctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy);
      }
      sctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      sctx.stroke();
      // Core pass
      sctx.globalAlpha = 1;
      sctx.strokeStyle = '#0a0';
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        const cpx = (prev.x + cur.x) / 2;
        const cpy = (prev.y + cur.y) / 2;
        sctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy);
      }
      sctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      sctx.stroke();
      sctx.restore();
    }
  }

  // Walls
  tilemap.renderCollision(sctx);

  // Non-elevator door gradients + edge lines
  if (state.doorTriggers) {
    for (const door of state.doorTriggers) {
      if (door.doorDir === 'elevator') continue;
      const dark = 'rgba(12, 12, 26, 1)';
      const clear = 'rgba(12, 12, 26, 0)';
      let grad;
      if (door.doorDir === 'N') {
        grad = sctx.createLinearGradient(0, door.y, 0, door.y + door.h);
        grad.addColorStop(0, dark);
        grad.addColorStop(1, clear);
      } else if (door.doorDir === 'S') {
        grad = sctx.createLinearGradient(0, door.y, 0, door.y + door.h);
        grad.addColorStop(0, clear);
        grad.addColorStop(1, dark);
      } else if (door.doorDir === 'W') {
        grad = sctx.createLinearGradient(door.x, 0, door.x + door.w, 0);
        grad.addColorStop(0, dark);
        grad.addColorStop(1, clear);
      } else {
        grad = sctx.createLinearGradient(door.x, 0, door.x + door.w, 0);
        grad.addColorStop(0, clear);
        grad.addColorStop(1, dark);
      }
      sctx.fillStyle = grad;
      sctx.fillRect(door.x, door.y, door.w, door.h);
      // Subtle edge lines on the wall side
      sctx.globalAlpha = 0.25;
      sctx.fillStyle = '#5588aa';
      if (door.doorDir === 'N' || door.doorDir === 'S') {
        sctx.fillRect(door.x, door.y, 1, door.h);
        sctx.fillRect(door.x + door.w - 1, door.y, 1, door.h);
      } else {
        sctx.fillRect(door.x, door.y, door.w, 1);
        sctx.fillRect(door.x, door.y + door.h - 1, door.w, 1);
      }
      sctx.globalAlpha = 1;
    }
  }

  return c;
}

// ─── Rendering ───
game.addSystem({
  render(ctx, interp, state) {
    // Title screen renders on HUD canvas (unzoomed) — skip game world
    if (state.menus.currentMenu === 'title') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, _vw, _vh);
      const hCtx = state.hudCtx;
      hCtx.setTransform(_hudScale, 0, 0, _hudScale, 0, 0);
      hCtx.clearRect(0, 0, _hvw, 270);
      hCtx.globalAlpha = 1;
      hCtx.textBaseline = 'alphabetic';
      hCtx.textAlign = 'start';
      state.menus.render(hCtx, state);
      return;
    }

    const tilemap = state.tilemap;
    if (!tilemap) return;

    // Rebuild static layer on room change
    if (state._staticDirty) {
      state._staticLayerCanvas = _buildStaticLayer(state);
      state._staticDirty = false;
    }

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, _vw, _vh);

    ctx.save();
    state.camera.apply(ctx);

    // Static layer (floor tiles, wire geometry, walls, door gradients)
    if (state._staticLayerCanvas) {
      ctx.drawImage(state._staticLayerCanvas, 0, 0);
    }

    // Neon wire energy pulse (time-animated — stays live)
    if (state.wires && state.wires.length > 0) {
      const wireNow = performance.now() / 1000;

      // Energy pulse — one wire at a time, picks a new random wire each cycle
      {
        const sampleWire = (points, t) => {
          const segs = [{ x: points[0].x, y: points[0].y }];
          for (let i = 1; i < points.length; i++) {
            segs.push({ x: (points[i - 1].x + points[i].x) / 2, y: (points[i - 1].y + points[i].y) / 2 });
          }
          segs.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
          const total = segs.length - 1;
          const raw = t * total;
          const idx = Math.min(Math.floor(raw), total - 1);
          const lt = raw - idx;
          const p0 = segs[idx];
          const p2 = segs[idx + 1];
          const cp = points[Math.min(idx, points.length - 1)];
          const u = 1 - lt;
          return {
            x: u * u * p0.x + 2 * u * lt * cp.x + lt * lt * p2.x,
            y: u * u * p0.y + 2 * u * lt * cp.y + lt * lt * p2.y,
          };
        };

        const cycleLen = 1.8; // 1.0s travel + 0.8s pause
        const speed = 0.5;
        const elapsed = wireNow * speed;
        const cycleNum = Math.floor(elapsed / cycleLen);
        // Hash cycle number to pick a pseudo-random wire
        const pwi = (Math.imul(cycleNum, 2654435761) >>> 0) % state.wires.length;
        const rawT = elapsed % cycleLen;

        const wire = state.wires[pwi];
        const pts = wire.points;
        if (pts.length >= 2 && rawT <= 1) {
          const pulseT = rawT;
          const pos = sampleWire(pts, pulseT);

          // Feed position to lighting system for real glow
          state.lighting.wirePulse = { x: pos.x, y: pos.y };

          // Bright pulse core
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#5f5';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Pulse glow
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#0f0';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
          ctx.fill();

          // Trail behind the pulse
          for (let tr = 1; tr <= 3; tr++) {
            const trailT = Math.max(0, pulseT - tr * 0.04);
            const tp = sampleWire(pts, trailT);
            ctx.globalAlpha = 0.2 - tr * 0.05;
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, 2 - tr * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }

    // Blood pools (floor decals — below entities)
    state.bloodPools.render(ctx);

    // Fire hazards (on floor, below entities)
    fireSystem.render(ctx);

    // Cryo pod (broken sleep chamber in start room)
    if (state.cryoPod) {
      const pod = state.cryoPod;
      const px = pod.x;
      const py = pod.y;

      // Cryo fluid puddle on floor
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#4af';
      ctx.fillRect(px - 16, py - 12, 32, 24);
      ctx.globalAlpha = 0.08;
      ctx.fillRect(px - 20, py - 6, 40, 12);
      ctx.globalAlpha = 1;

      // Glass shards scattered on floor
      for (const s of pod.shards) {
        ctx.save();
        ctx.translate(Math.round(s.x), Math.round(s.y));
        ctx.rotate(s.rot);
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = '#8cf';
        ctx.fillRect(-Math.round(s.w / 2), -Math.round(s.h / 2), Math.round(s.w), Math.round(s.h));
        // Bright highlight edge
        ctx.fillStyle = '#cef';
        ctx.fillRect(-Math.round(s.w / 2), -Math.round(s.h / 2), 1, Math.round(s.h));
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // Metal base platform
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(px - 13, py - 10, 26, 20);
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(px - 12, py - 9, 24, 18);

      // Top frame rail
      ctx.fillStyle = '#4a4a5a';
      ctx.fillRect(px - 14, py - 11, 28, 2);
      // Bottom frame rail
      ctx.fillRect(px - 14, py + 9, 28, 2);

      // Left glass panel (broken — jagged top edge)
      ctx.fillStyle = 'rgba(100, 170, 255, 0.3)';
      ctx.fillRect(px - 13, py - 5, 2, 12);
      ctx.fillStyle = 'rgba(100, 170, 255, 0.25)';
      ctx.fillRect(px - 13, py - 8, 2, 4);
      ctx.fillRect(px - 13, py - 10, 1, 2);

      // Right glass panel (broken — shattered open)
      ctx.fillStyle = 'rgba(100, 170, 255, 0.3)';
      ctx.fillRect(px + 11, py - 4, 2, 11);
      ctx.fillStyle = 'rgba(100, 170, 255, 0.25)';
      ctx.fillRect(px + 11, py - 7, 2, 4);
      ctx.fillRect(px + 12, py - 9, 1, 2);

      // Interior cryo tubes (broken connectors)
      ctx.fillStyle = '#446';
      ctx.fillRect(px - 10, py - 9, 2, 3);
      ctx.fillRect(px + 8, py - 9, 2, 3);

      // Dangling cables from top frame
      ctx.strokeStyle = '#363';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - 8, py + 10);
      ctx.lineTo(px - 14, py + 18);
      ctx.lineTo(px - 18, py + 24);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + 8, py + 10);
      ctx.lineTo(px + 12, py + 16);
      ctx.lineTo(px + 18, py + 22);
      ctx.stroke();

      // Status LEDs on frame (blinking red — malfunction)
      const blink = Math.sin(performance.now() / 300) > 0;
      if (blink) {
        ctx.fillStyle = '#f22';
        ctx.fillRect(px - 14, py - 10, 1, 1);
        ctx.fillRect(px + 13, py - 10, 1, 1);
      }
      ctx.fillStyle = '#0a0';
      ctx.fillRect(px - 12, py - 10, 1, 1);
    }

    // Elevator door (time-animated pulsing glow — stays live)
    if (state.doorTriggers) {
      for (const door of state.doorTriggers) {
        if (door.doorDir !== 'elevator') continue;
        const pulse = 0.3 + Math.sin(performance.now() / 400) * 0.15;
        ctx.fillStyle = `rgba(255, 200, 50, ${pulse})`;
        ctx.fillRect(door.x, door.y, door.w, door.h);
        ctx.strokeStyle = 'rgba(255, 220, 100, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(door.x + 1, door.y + 1, door.w - 2, door.h - 2);
        // Arrow up icon
        const ecx = door.x + door.w / 2;
        const ecy = door.y + door.h / 2;
        ctx.fillStyle = 'rgba(255, 255, 200, 0.8)';
        ctx.fillRect(ecx - 1, ecy - 4, 2, 8);
        ctx.fillRect(ecx - 3, ecy - 2, 6, 2);
      }
    }

    // Props
    const propsToRender = state.ecs.queryTag('prop');
    for (const pid of propsToRender) {
      const ppos = state.ecs.get(pid, 'position');
      const pprop = state.ecs.get(pid, 'prop');
      const pcol = state.ecs.get(pid, 'collider');
      const phit = state.ecs.get(pid, 'health');
      if (!ppos || !pprop || !pcol) continue;

      const flashing = state.juice && state.juice.isFlashing(pid);
      const pcx = Math.round(ppos.x + pcol.offsetX + pcol.w / 2);
      const pcy = Math.round(ppos.y + pcol.offsetY + pcol.h / 2);
      const spriteDrawn = !flashing && drawPickupSprite(ctx, pprop.type, pcx, pcy, 0.5);
      if (!spriteDrawn) {
        ctx.fillStyle = flashing ? '#fff' : pprop.def.color;
        ctx.fillRect(
          Math.round(ppos.x + pcol.offsetX),
          Math.round(ppos.y + pcol.offsetY),
          pcol.w, pcol.h
        );
      }

      if (phit && phit.current < phit.max) {
        const barW = pcol.w;
        const bx = Math.round(ppos.x + pcol.offsetX);
        const by = Math.round(ppos.y + pcol.offsetY - 3);
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barW, 2);
        ctx.fillStyle = '#f80';
        ctx.fillRect(bx, by, Math.max(0, barW * (phit.current / phit.max)), 2);
      }
    }

    // Enemies
    const ENEMY_COLORS = {
      security_guard: '#3a4a8a',
      scientist: '#4a8a4a',
      riot_soldier: '#5a6a8a',
      lab_mutant: '#7a3a8a',
      drone: '#3a8a8a',
      mech_soldier: '#8a6a3a',
      commander: '#8a2040',
      warden: '#6a1050',
    };
    const enemies = state.ecs.queryTag('enemy');
    for (const eid of enemies) {
      const epos = state.ecs.get(eid, 'position');
      const eai = state.ecs.get(eid, 'ai');
      const ehealth = state.ecs.get(eid, 'health');
      if (!epos) continue;

      const flashing = state.juice && state.juice.isFlashing(eid);
      const isBoss = eai?.isBoss;
      const ecol = state.ecs.get(eid, 'collider');
      const baseSz = ecol ? Math.max(ecol.w, ecol.h) : 12;
      const sz = baseSz;
      const half = sz / 2;

      const baseColor = eai?._rageMode ? '#c02040' : (ENEMY_COLORS[eai?.type] || '#3a4a8a');
      const ecolor = flashing ? '#fff' :
                     eai?.state === 'hurt' ? '#faa' :
                     eai?.state === 'dead' ? '#333' :
                     eai?.state === 'grabbed' ? '#aaf' :
                     eai?.state === 'thrown' ? '#f0f' :
                     eai?.state === 'attack_windup' ? '#ff4444' :
                     eai?.state === 'attack_active' ? '#ff0' :
                     baseColor;
      // Boss mutation: scale original sprite during transition, swap to mutated after
      // Variant suffix: _v1.._v6 for boss visual variants (0 = original, no suffix)
      const vSuffix = eai?._variant ? `_v${eai._variant}` : '';
      let eSpriteType = eai?.type + vSuffix;
      let eSpriteScale = undefined;
      const trembleX = eai?._trembleX || 0;
      if (eai?._rageMode) {
        eSpriteType = eai.type + '_mutated' + vSuffix;
      } else if (eai?._mutateProgress > 0) {
        eSpriteScale = 1 + eai._mutateProgress;
      }
      const eSpriteDrawn = drawSprite(ctx, eSpriteType, eai?.facingX ?? 1, eai?.facingY ?? 0, epos.x + trembleX, epos.y, eSpriteScale);
      if (!eSpriteDrawn) {
        ctx.fillStyle = ecolor;
        ctx.fillRect(Math.round(epos.x - half), Math.round(epos.y - half), sz, sz);
      } else if (ecolor !== baseColor) {
        // State tint overlay (hurt, dead, grabbed, attack flash, etc.)
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = ecolor;
        ctx.fillRect(Math.round(epos.x - half), Math.round(epos.y - half), sz, sz);
        ctx.globalAlpha = 1;
      }

      // Status effect overlays
      if (eai?.status && eai.state !== 'dead') {
        const st = eai.status;
        if (st.type === 'stun') {
          // Electric blue flicker overlay
          ctx.globalAlpha = 0.3 + Math.sin(performance.now() / 30) * 0.2;
          ctx.fillStyle = '#4af';
          ctx.fillRect(Math.round(epos.x - half), Math.round(epos.y - half), sz, sz);
          ctx.globalAlpha = 1;
        } else if (st.type === 'freeze') {
          // Ice blue tint + outline
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#8ef';
          ctx.fillRect(Math.round(epos.x - half), Math.round(epos.y - half), sz, sz);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#4cf';
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(epos.x - half), Math.round(epos.y - half), sz, sz);
        } else if (st.type === 'burn') {
          // Green acid drip overlay
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#4f4';
          ctx.fillRect(Math.round(epos.x - half), Math.round(epos.y + half - 3), sz, 3);
          ctx.globalAlpha = 1;
        }
      }
      // Bleed indicator (separate from status — can show alongside)
      if (eai?.bleed) {
        ctx.fillStyle = '#c00';
        // Dripping blood streaks down the enemy
        const bx = Math.round(epos.x - half);
        const by = Math.round(epos.y);
        const drip = Math.round((1 - eai.bleed.timer / 3) * 6);
        ctx.fillRect(bx + 1, by, 1, Math.min(half + drip, half + 6));
        ctx.fillRect(bx + sz - 2, by - 2, 1, Math.min(half + drip + 2, half + 8));
        ctx.globalAlpha = 0.4;
        ctx.fillRect(bx + Math.floor(sz / 2), by + 1, 1, Math.min(half + drip - 1, half + 4));
        ctx.globalAlpha = 1;
      }

      // Attack telegraph — red scan lines during windup
      if (eai && (eai.state === 'attack_windup' || eai.state === 'dash_windup')) {
        const blink = Math.sin(performance.now() / 40) > 0;
        if (blink) {
          const ex = Math.round(epos.x);
          const ey = Math.round(epos.y);
          const lineLen = isBoss ? 50 : 35;
          // Use lunge direction if available, otherwise facing
          const dirX = eai._lungeDir ? eai._lungeDir.x : (eai._dashDir ? eai._dashDir.x : (eai.facingX ?? 1));
          const dirY = eai._lungeDir ? eai._lungeDir.y : (eai._dashDir ? eai._dashDir.y : (eai.facingY ?? 0));

          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(Math.atan2(dirY, dirX));
          // Single color band — 1 tile (16px) wide
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#f22';
          ctx.fillRect(0, -8, lineLen, 16);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }

      // Shield indicator for riot soldiers
      if (eai?.hasShield && eai.state !== 'dead') {
        ctx.fillStyle = 'rgba(150, 200, 255, 0.5)';
        const shieldX = eai.facingX > 0 ? epos.x + half - 2 : epos.x - half;
        ctx.fillRect(Math.round(shieldX), Math.round(epos.y - half), 2, sz);
      }

      // Armor outline for mech soldiers
      if (eai?.armored && eai.state !== 'dead') {
        ctx.strokeStyle = '#c90';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(epos.x - half), Math.round(epos.y - half), sz, sz);
      }

      if (isBoss && eai?.state !== 'dead') {
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(epos.x - half), Math.round(epos.y - half), sz, sz);
      }

      // Alert "!" indicator — pixel art exclamation mark above head
      if (eai?.state === 'alert' && eai._alertStart) {
        const alertAge = (performance.now() - eai._alertStart) / 1000;
        // Reveal row by row from bottom over 0.12s (7 rows)
        const revealRows = Math.min(7, Math.floor(alertAge / 0.017));
        // Gentle bob after fully revealed
        const bob = revealRows >= 7 ? Math.sin((alertAge - 0.12) * 6) * 1 : 0;
        // Pixel-perfect position (integer coords, no scaling)
        const ax = Math.round(epos.x) - 1;
        const ay = Math.round(epos.y - half - 11) + Math.round(bob);
        //  Pixel art "!" — 3px wide, 7px tall:
        //  .#.  row 0 (top)
        //  ###  row 1
        //  .#.  row 2
        //  .#.  row 3
        //  .#.  row 4
        //  ...  row 5 (gap)
        //  .#.  row 6 (dot)
        const rows = [
          [1,0], // row 0: center pixel
          [0,0],[1,0],[2,0], // row 1: full width
          [1,0], // row 2: center
          [1,0], // row 3: center
          [1,0], // row 4: center
          // row 5: gap (nothing)
          [1,2], // row 6: dot (offset y+2 to skip gap row 5)
        ];
        // Draw outline first (black), then fill (yellow)
        // Outline: 1px border around each filled pixel
        const shown = 7 - revealRows; // start row (reveal bottom-up)
        // Black outline behind
        ctx.fillStyle = '#000';
        for (const [px, extraY] of rows) {
          const ry = px === 1 && extraY === 2 ? 6 : (px === 0 ? 1 : px === 2 ? 1 : rows.indexOf(rows.find(r => r === [px, extraY])));
        }
        // Simpler approach: draw each pixel with outline
        const pixels = [
          // [x, y] relative to ax, ay — the "!" shape
          [1, 0], // top cap
          [0, 1], [1, 1], [2, 1], // wide row
          [1, 2], // stem
          [1, 3], // stem
          [1, 4], // stem
          // row 5 = gap
          [1, 6], // dot
        ];
        // Black outline (draw 1px ring around each pixel)
        ctx.fillStyle = '#000';
        for (const [px, py] of pixels) {
          if (py < shown) continue; // row-by-row reveal
          ctx.fillRect(ax + px - 1, ay + py, 1, 1);
          ctx.fillRect(ax + px + 1, ay + py, 1, 1);
          ctx.fillRect(ax + px, ay + py - 1, 1, 1);
          ctx.fillRect(ax + px, ay + py + 1, 1, 1);
        }
        // Yellow fill
        ctx.fillStyle = '#ff0';
        for (const [px, py] of pixels) {
          if (py < shown) continue;
          ctx.fillRect(ax + px, ay + py, 1, 1);
        }
      }

      // Facing indicator
      if (eai && eai.state !== 'dead') {
        ctx.fillStyle = isBoss ? '#ff4444' : '#e94560';
        const fDirX = Math.abs(eai.facingX ?? 1) >= Math.abs(eai.facingY ?? 0) ? ((eai.facingX ?? 1) >= 0 ? 1 : -1) : 0;
        const fDirY = Math.abs(eai.facingY ?? 0) > Math.abs(eai.facingX ?? 1) ? ((eai.facingY ?? 0) >= 0 ? 1 : -1) : 0;
        ctx.fillRect(
          Math.round(epos.x + fDirX * (half - 1) - 1),
          Math.round(epos.y + fDirY * (half - 1) - 1),
          3, 3
        );
      }

      // Health bar
      if (ehealth && eai?.state !== 'dead') {
        const barW = isBoss ? 24 : Math.max(14, sz + 2);
        const barH = isBoss ? 3 : 2;
        const bx = Math.round(epos.x - barW / 2);
        const by = Math.round(epos.y - half - 4);
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = isBoss ? '#ff4444' : '#e94560';
        ctx.fillRect(bx, by, Math.max(0, barW * (ehealth.current / ehealth.max)), barH);
      }
    }

    // Boss rage transformation (cinematic overlays — sprites drawn by normal enemy renderer)
    if (state.cutscene._anim && state.cutscene._rageBossId !== null) {
      const rbId = state.cutscene._rageBossId;
      const rbPos = state.ecs.get(rbId, 'position');
      if (rbPos) {
        const ra = state.cutscene._anim;
        const rt = Math.min(1, ra.timer / ra.duration);
        const cx = rbPos.x;
        const cy = rbPos.y;

        // ── TREMBLE: screen darkens, red tint pulses on boss ──
        if (ra.type === 'boss_tremble') {
          // Screen darkens
          ctx.globalAlpha = 0.05 + rt * 0.15;
          ctx.fillStyle = '#200';
          ctx.fillRect(0, 0, _vw, _vh);
          // Red flash overlay on boss area
          ctx.globalAlpha = 0.3 * (Math.sin(rt * Math.PI * 14) * 0.5 + 0.5);
          ctx.fillStyle = '#f00';
          ctx.fillRect(Math.round(cx - 16), Math.round(cy - 16), 32, 32);
          ctx.globalAlpha = 1;
        }

        // ── TRANSFORM: red aura grows with sprite, final white flash ──
        if (ra.type === 'boss_transform') {
          const bai = state.ecs.get(rbId, 'ai');
          const progress = bai?._mutateProgress || 0;
          const spriteR = 16 + progress * 16; // radius grows with sprite

          // Red aura glow around the growing boss
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(rt * Math.PI * 8);
          ctx.fillStyle = '#f00';
          ctx.fillRect(
            Math.round(cx - spriteR - 4), Math.round(cy - spriteR - 4),
            Math.round((spriteR + 4) * 2), Math.round((spriteR + 4) * 2)
          );

          // Screen-edge red vignette
          ctx.globalAlpha = 0.08 + rt * 0.1;
          ctx.fillStyle = '#300';
          ctx.fillRect(0, 0, _vw, _vh);

          // White screen flash at the end (last 15%) — covers the sprite swap
          if (rt > 0.85) {
            const flashT = (rt - 0.85) / 0.15;
            ctx.globalAlpha = flashT * 0.7;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, _vw, _vh);
          }

          ctx.globalAlpha = 1;
        }
      }
    }

    // Projectiles
    const projectiles = state.ecs.queryTag('projectile');
    const projLights = [];
    for (const pid of projectiles) {
      const ppos = state.ecs.get(pid, 'position');
      if (!ppos) continue;
      ctx.fillStyle = '#f44';
      ctx.fillRect(Math.round(ppos.x - 2), Math.round(ppos.y - 2), 4, 4);
      ctx.fillStyle = '#ff8';
      ctx.fillRect(Math.round(ppos.x - 1), Math.round(ppos.y - 1), 2, 2);
      projLights.push({ x: ppos.x, y: ppos.y });
    }
    state.lighting.projectileLights = projLights;

    // Floor hazards (warning indicators)
    const hazards = state.ecs.queryTag('hazard');
    for (const hid of hazards) {
      const hpos = state.ecs.get(hid, 'position');
      const haz = state.ecs.get(hid, 'hazard');
      if (!hpos || !haz) continue;
      const r = haz.radius / 2;
      const blink = Math.sin(performance.now() / 80) > 0;
      ctx.globalAlpha = haz.delay < 0.3 ? 0.5 : 0.25;
      ctx.fillStyle = blink ? '#f44' : '#f80';
      ctx.fillRect(Math.round(hpos.x - r), Math.round(hpos.y - r), haz.radius, haz.radius);
      ctx.globalAlpha = 1;
    }

    // Pickups
    const pickups = state.ecs.queryTag('pickup');
    const bobTime = performance.now() / 1000;
    for (const pid of pickups) {
      const ppos = state.ecs.get(pid, 'position');
      const pickup = state.ecs.get(pid, 'pickup');
      if (!ppos || !pickup) continue;
      const bob = Math.sin(bobTime * 3 + (pickup.bobOffset || 0)) * 2;
      const wx = Math.round(ppos.x);
      const wy = Math.round(ppos.y + bob);
      if (pickup.type === 'health') {
        if (!drawPickupSprite(ctx, 'health_kit', wx, wy)) {
          ctx.fillStyle = '#4f4';
          ctx.fillRect(wx - 3, wy - 1, 6, 2);
          ctx.fillRect(wx - 1, wy - 3, 2, 6);
        }
      } else if (pickup.type === 'upgrade') {
        const upgradeKey = pickup.upgradeType || '';
        if (!drawPickupSprite(ctx, upgradeKey, wx, wy)) {
          // Fallback: diamond shape in upgrade color
          const c = pickup.def ? pickup.def.color : '#fff';
          ctx.fillStyle = c;
          ctx.fillRect(wx - 1, wy - 3, 2, 6);
          ctx.fillRect(wx - 3, wy - 1, 6, 2);
        }
        // Glow pulse on top of sprite
        const c = pickup.def ? pickup.def.color : '#fff';
        ctx.globalAlpha = 0.2 + Math.sin(bobTime * 5) * 0.1;
        ctx.fillStyle = c;
        ctx.fillRect(wx - 10, wy - 10, 20, 20);
        ctx.globalAlpha = 1;
      } else {
        const wdef = pickup.weaponType ? WEAPON_DEFS[pickup.weaponType] : null;
        if (!drawPickupSprite(ctx, pickup.weaponType || '', wx, wy)) {
          ctx.fillStyle = wdef ? wdef.color : '#fff';
          ctx.fillRect(wx - 3, wy - 1, 6, 3);
          ctx.fillRect(wx - 1, wy - 3, 2, 7);
        }

        // Collect "Press E" indicators for World UI layer (rendered after lighting)
        if (pickup.weaponType) {
          const playerPos = state.ecs.get(state.playerId, 'position');
          if (playerPos) {
            const dx = playerPos.x - ppos.x;
            const dy = playerPos.y - ppos.y;
            if (dx * dx + dy * dy < 20 * 20) {
              state._worldUI_pressE = state._worldUI_pressE || [];
              state._worldUI_pressE.push({ x: wx, y: wy });
            }
          }
        }
      }
    }

    // Thrown weapon projectiles (beaker in flight)
    const projectileIds = state.ecs.queryTag('projectile');
    for (const projId of projectileIds) {
      const ppos = state.ecs.get(projId, 'position');
      const proj = state.ecs.get(projId, 'projectile');
      if (!ppos || !proj) continue;
      const wx = Math.round(ppos.x);
      const wy = Math.round(ppos.y);
      if (!drawPickupSprite(ctx, proj.weaponType || '', wx, wy)) {
        ctx.fillStyle = '#8f8';
        ctx.fillRect(wx - 3, wy - 3, 6, 6);
      }
    }

    // Player
    const pos = state.ecs.get(state.playerId, 'position');
    const player = state.ecs.get(state.playerId, 'player');
    if (pos && player) {
      if (player.state === 'dash') {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#00d2ff';
        ctx.fillRect(Math.round(pos.x - 6), Math.round(pos.y - 6), 12, 12);
        ctx.globalAlpha = 1;
      }
      let pcolor = '#e0e0e0';
      if (player.state === 'dead') pcolor = '#666';
      else if (player.state === 'hurt') pcolor = '#f44';
      else if (player.state === 'dash') pcolor = '#00d2ff';
      else if (player.state === 'grab') pcolor = '#aaf';
      else if (player.state === 'throw') pcolor = '#f0f';
      else if (player.state.startsWith('attack_light')) pcolor = '#ffa';
      else if (player.state === 'attack_heavy') {
        // Pulsing tint during windup to signal charge-up
        if (player.attackPhase === 'windup') {
          pcolor = Math.sin(performance.now() / 50) > 0 ? '#fff' : '#f80';
        } else {
          pcolor = '#f80';
        }
      }
      const pSpriteDrawn = drawSprite(ctx, 'player', player.facingDirX, player.facingDirY, pos.x, pos.y);
      if (!pSpriteDrawn) {
        ctx.fillStyle = pcolor;
        ctx.fillRect(Math.round(pos.x - 6), Math.round(pos.y - 6), 12, 12);
      } else if (pcolor !== '#e0e0e0') {
        // State tint overlay when not idle (stronger during heavy windup)
        const isCharging = player.state === 'attack_heavy' && player.attackPhase === 'windup';
        ctx.globalAlpha = isCharging ? 0.7 : 0.45;
        ctx.fillStyle = pcolor;
        ctx.fillRect(Math.round(pos.x - 6), Math.round(pos.y - 6), 12, 12);
        ctx.globalAlpha = 1;
      }
      // Equipped weapon display
      const pcombat = state.ecs.get(state.playerId, 'combat');
      if (pcombat?.weapon?.type && player.state !== 'dead') {
        drawEquippedWeapon(ctx, pcombat.weapon.type, player.facingDirX, player.facingDirY, pos.x, pos.y);
      }
    }

    // Active hitboxes (debug)
    if (state.combatSystem) {
      ctx.globalAlpha = 0.3;
      for (const hb of state.combatSystem.activeHitboxes) {
        ctx.fillStyle = hb.type === 'attack_heavy' ? '#f80' : '#ff0';
        ctx.fillRect(Math.round(hb.x), Math.round(hb.y), hb.w, hb.h);
      }
      ctx.globalAlpha = 1;
    }

    // Impact effects (shockwaves, ground cracks)
    if (state.juice) state.juice.renderImpacts(ctx);

    // Popups (world space)
    state.hud.renderPopups(ctx, state.camera);

    // Particles
    state.particles.render(ctx);

    // Hit effects (world space, above particles, below lighting)
    drawHitEffects(ctx);

    // Lighting overlay
    state.lighting.render(ctx, state.camera, state);

    // ── World UI layer (position-aware, lighting-immune) ──
    // Items here follow map coordinates but render above the lighting overlay.
    state.hud.renderTutorial(ctx, state);

    // "Press E" floating indicators
    if (state._worldUI_pressE) {
      const eBob = Math.sin(performance.now() / 250) * 1.5;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7px monospace';
      for (const pe of state._worldUI_pressE) {
        ctx.fillText('E', pe.x - 3, pe.y - 7 + eBob);
      }
      state._worldUI_pressE = null;
    }

    // Fog patches (rendered after lighting so they glow through darkness)
    if (state.fogPatches) {
      const now = performance.now() / 1000;
      const brush = _getFogBrush();
      for (const fog of state.fogPatches) {
        const drift = Math.sin(now * 0.15 + fog.phase);
        const baseFx = fog.x + fog.driftX * drift;
        const baseFy = fog.y + fog.driftY * Math.sin(now * 0.1 + fog.phase + 1);
        const breathe = fog.radius + Math.sin(now * 0.25 + fog.phase) * 6;

        // Layer 2 widely-spread sub-clouds
        for (let layer = 0; layer < 2; layer++) {
          const lPhase = fog.phase + layer * 3.14;
          const ox = Math.sin(now * 0.12 + lPhase) * breathe * 0.5;
          const oy = Math.cos(now * 0.09 + lPhase) * breathe * 0.45;
          const fx = baseFx + ox;
          const fy = baseFy + oy;
          const r = breathe * (1.0 + layer * 0.3);
          const d = r * 2;
          ctx.drawImage(brush, fx - r, fy - r, d, d);
        }
      }
    }

    // Steam vents (periodic bursts — rendered after lighting)
    if (state.steamVents) {
      const now = performance.now() / 1000;
      ctx.fillStyle = '#dee8f0';
      for (const vent of state.steamVents) {
        const cycle = (now + vent.phase) % vent.interval;
        const burstDuration = 1.8;
        if (cycle > burstDuration) continue; // idle between bursts
        const t = cycle / burstDuration; // 0→1 burst progress

        // Batch puffs by similar alpha to minimize state changes
        const puffCount = 7;
        for (let i = 0; i < puffCount; i++) {
          const puffT = Math.max(0, Math.min(1, t * 2.5 - i * 0.12));
          if (puffT <= 0) continue;
          const dist = puffT * 28;
          const spread = puffT * 6;
          const px = vent.x + vent.dirX * dist + Math.sin(i * 2.1 + now * 3) * spread;
          const py = vent.y + vent.dirY * dist + Math.cos(i * 1.7 + now * 2) * spread;
          const alpha = (1 - puffT * puffT) * 0.45;
          const r = (3 + puffT * 8) / 2;
          // Use fillRect instead of arc — visually identical at this scale, much cheaper
          ctx.globalAlpha = alpha;
          const rx = Math.round(px - r);
          const ry = Math.round(py - r);
          const rd = Math.round(r * 2);
          ctx.fillRect(rx, ry, rd, rd);
        }
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Post-processing (vignette, scanlines, chromatic aberration)
    state.postprocess.render(ctx);

    // ── HUD overlay (native resolution, always 270 virtual height) ──
    const hCtx = state.hudCtx;
    hCtx.setTransform(_hudScale, 0, 0, _hudScale, 0, 0);
    hCtx.clearRect(0, 0, _hvw, 270);
    // Reset canvas text/alpha state (other renderers may leave dirty state)
    hCtx.globalAlpha = 1;
    hCtx.textBaseline = 'alphabetic';
    hCtx.textAlign = 'start';

    // HUD (screen space)
    state.hud.render(hCtx, state);

    // Room transition fade
    const fl = state.floor;
    if (fl) fl.renderTransition(hCtx, _hvw);

    // Menu overlays (pause, gameover, victory)
    state.menus.render(hCtx, state);

    // Touch controls overlay (hidden during cutscenes and menus)
    if (!state.cutscene.active && state.menus.currentMenu === 'none') {
      state.input.renderTouch(hCtx);
    }

    // Cutscene overlay (dialogue, fades)
    state.cutscene.render(hCtx, _hvw, 270);
  }
});

// ─── End of frame ───
game.addSystem({
  update(dt, state) {
    state.input.endFrame();
  },
  hitstopUpdate(dt, state) {
    state.input.endFrame();
  }
});

(async () => {
  await loadAllSprites();
  await loadHitEffects();
  loadDecorTiles(); // fire-and-forget — patches render when ready
  fetchSolPrice(); // fire-and-forget — don't block game start
  game.start();
})();
