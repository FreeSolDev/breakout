import { Tilemap } from './tilemap.js';
import { getRandomTemplate, ROOM_TEMPLATES } from './room-templates.js';
import { ENEMY_FACTORIES, createCommander, createWarden } from '../entities/enemies.js';
import { solPrice } from '../engine/sol-price.js';
import { createWeaponPickup } from '../entities/weapons.js';
import { createUpgradePickup } from '../entities/pickups.js';
import { createProp } from '../entities/props.js';

const TILE = 16;

// Directions for grid adjacency
const DIRS = [
  { dx: 0, dy: -1, door: 'N', opposite: 'S' },
  { dx: 0, dy: 1, door: 'S', opposite: 'N' },
  { dx: 1, dy: 0, door: 'E', opposite: 'W' },
  { dx: -1, dy: 0, door: 'W', opposite: 'E' },
];

export class Floor {
  constructor(floorNumber) {
    this.floorNumber = floorNumber;
    this.rooms = [];           // Array of { gridX, gridY, template, type, cleared }
    this.grid = new Map();     // "gx,gy" -> room index
    this.connections = [];     // Array of { from, to, doorDir }
    this.currentRoomIndex = 0;
    this.transitioning = false;
    this.transitionAlpha = 0;
    this.transitionTarget = -1;
    this.transitionDoorDir = null;
    this.spawnedEntityIds = []; // Track entities in current room for cleanup
  }

  // Generate a floor layout using random walk
  generate() {
    const roomCount = 5 + Math.min(4, this.floorNumber); // 5-9 rooms

    // Place rooms via random walk on a grid
    const placed = [{ gx: 0, gy: 0 }];
    this.grid.set('0,0', 0);

    let attempts = 0;
    while (placed.length < roomCount && attempts < 200) {
      attempts++;
      // Pick a random existing room to branch from
      const src = placed[Math.floor(Math.random() * placed.length)];
      const dir = DIRS[Math.floor(Math.random() * 4)];
      const ngx = src.gx + dir.dx;
      const ngy = src.gy + dir.dy;
      const key = `${ngx},${ngy}`;

      if (!this.grid.has(key)) {
        const idx = placed.length;
        placed.push({ gx: ngx, gy: ngy });
        this.grid.set(key, idx);
      }
    }

    // Assign room types
    // First room = start, boss = farthest room from spawn, guaranteed cache + rest
    const types = new Array(placed.length).fill('combat');
    types[0] = 'start';

    // Pick the room farthest from spawn (0,0) as the boss room
    // This guarantees the boss is never adjacent to start
    let bossIdx = placed.length - 1;
    let bestDist = 0;
    for (let i = 1; i < placed.length; i++) {
      const dist = Math.abs(placed[i].gx) + Math.abs(placed[i].gy);
      if (dist > bestDist) {
        bestDist = dist;
        bossIdx = i;
      }
    }
    types[bossIdx] = 'boss';

    // Place a rest room and a cache room in the middle (skip boss index)
    if (placed.length > 3) {
      const mid = Math.floor(placed.length / 2);
      const restIdx = mid === bossIdx ? (mid > 1 ? mid - 1 : mid + 1) : mid;
      types[restIdx] = 'rest';
      if (placed.length > 4) {
        let cacheIdx = Math.max(1, restIdx - 1);
        if (types[cacheIdx] !== 'combat') cacheIdx = Math.min(placed.length - 1, restIdx + 1);
        if (types[cacheIdx] === 'combat') types[cacheIdx] = 'cache';
      }
    }

    // Convert some combat rooms to corridors (rest passages)
    for (let i = 1; i < placed.length; i++) {
      if (types[i] !== 'combat') continue;
      // ~25% chance a combat room becomes a corridor passage
      if (Math.random() < 0.25) {
        types[i] = 'corridor';
      }
    }

    // Build room objects with templates
    for (let i = 0; i < placed.length; i++) {
      const template = getRandomTemplate(types[i]);
      this.rooms.push({
        gridX: placed[i].gx,
        gridY: placed[i].gy,
        template,
        type: types[i],
        cleared: types[i] === 'start' || types[i] === 'rest' || types[i] === 'corridor',
        visited: i === 0, // only start room is visited initially
      });
    }

    // Find connections between adjacent rooms
    for (let i = 0; i < placed.length; i++) {
      for (const dir of DIRS) {
        const nkey = `${placed[i].gx + dir.dx},${placed[i].gy + dir.dy}`;
        if (this.grid.has(nkey)) {
          const j = this.grid.get(nkey);
          // Avoid duplicate connections
          if (j > i) {
            this.connections.push({ from: i, to: j, doorDir: dir.door });
          }
        }
      }
    }

    // Align corridor-style templates with their actual connection axes
    // (e.g. N/S connections → vertical corridor, E/W → horizontal)
    for (let i = 0; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      if (!room.template.axis) continue;

      const doors = this.getDoorsForRoom(i);
      const hasVertical = doors.some(d => d.dir === 'N' || d.dir === 'S');
      const hasHorizontal = doors.some(d => d.dir === 'E' || d.dir === 'W');

      let needAxis = null;
      if (hasVertical && !hasHorizontal) needAxis = 'vertical';
      else if (hasHorizontal && !hasVertical) needAxis = 'horizontal';

      if (needAxis && room.template.axis !== needAxis) {
        const pool = ROOM_TEMPLATES[room.type];
        const match = pool.filter(t => t.axis === needAxis);
        if (match.length > 0) {
          room.template = match[Math.floor(Math.random() * match.length)];
        }
      }
    }
  }

  // Get door directions available for a room
  getDoorsForRoom(roomIndex) {
    const doors = [];
    for (const conn of this.connections) {
      if (conn.from === roomIndex) {
        doors.push({ targetRoom: conn.to, dir: conn.doorDir });
      } else if (conn.to === roomIndex) {
        // Reverse direction
        const opposite = DIRS.find(d => d.door === conn.doorDir).opposite;
        doors.push({ targetRoom: conn.from, dir: opposite });
      }
    }
    return doors;
  }

  // Load a room into the game state
  loadRoom(roomIndex, state, entryDir) {
    const room = this.rooms[roomIndex];
    const tmpl = room.template;
    this.currentRoomIndex = roomIndex;
    room.visited = true;

    // Clean up old entities
    this.cleanupEntities(state);

    // Rebuild tilemap
    const tilemap = new Tilemap(tmpl.width, tmpl.height, TILE);
    tilemap.addLayer('floor');
    state.tilemap = tilemap;

    // Set walls
    for (const w of tmpl.walls) {
      tilemap.setSolid(w.x, w.y);
    }

    // Set door tiles as floor (already not in walls)
    // Get which doors this room actually connects to
    const activeDoors = this.getDoorsForRoom(roomIndex);
    const activeDoorDirs = new Set(activeDoors.map(d => d.dir));

    // Block door openings that don't connect to anything
    for (const dir of ['N', 'S', 'E', 'W']) {
      if (!activeDoorDirs.has(dir) && tmpl.doors[dir]) {
        // Wall off unused doors
        for (const dt of tmpl.doors[dir]) {
          tilemap.setSolid(dt.x, dt.y);
        }
      }
    }

    // Create door zones — unified trigger, visual, and collision gap
    state.doorTriggers = [];
    for (const door of activeDoors) {
      const doorTiles = tmpl.doors[door.dir];
      if (!doorTiles || doorTiles.length === 0) continue;

      // Bounding rect of the door tiles
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const dt of doorTiles) {
        minX = Math.min(minX, dt.x);
        minY = Math.min(minY, dt.y);
        maxX = Math.max(maxX, dt.x + 1);
        maxY = Math.max(maxY, dt.y + 1);
      }

      // Clear every tile in the zone from collision
      for (let ty = minY; ty < maxY; ty++) {
        for (let tx = minX; tx < maxX; tx++) {
          tilemap.setSolid(tx, ty, 0);
        }
      }

      // One rect for trigger + visual + collision gap
      state.doorTriggers.push({
        x: minX * TILE,
        y: minY * TILE,
        w: (maxX - minX) * TILE,
        h: (maxY - minY) * TILE,
        targetRoom: door.targetRoom,
        doorDir: door.dir,
      });
    }

    // Clear and set up lighting
    state.lighting.clear();
    for (const light of tmpl.lights) {
      state.lighting.addLight({
        x: light.x * TILE + TILE / 2,
        y: light.y * TILE + TILE / 2,
        radius: light.radius,
        color: light.color,
        intensity: 1,
      });
    }

    // Spawn enemies (scale count with floor number)
    const enemies = [...tmpl.enemies];
    // Add extra enemies on higher floors from template-defined safe positions
    const extraEnemies = Math.min(3, Math.floor(this.floorNumber / 2));
    if (extraEnemies > 0 && tmpl.extraSpawnPoints && tmpl.extraSpawnPoints.length > 0) {
      const available = [...tmpl.extraSpawnPoints];
      // Shuffle
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
      const types = tmpl.enemies.map(e => e.type);
      for (let i = 0; i < extraEnemies && i < available.length; i++) {
        const pt = available[i];
        enemies.push({ x: pt.x, y: pt.y, type: types[Math.floor(Math.random() * types.length)] });
      }
    }

    this.spawnedEntityIds = [];
    const floorMult = 1 + (this.floorNumber - 1) * 0.15; // +15% HP/damage per floor
    // SOL 24h change drives difficulty: |change| maps to a multiplier
    // ±0-2% = 1.0x (easy), ±2-5% = 1.15x, ±5-10% = 1.3x, ±10%+ = 1.5x (brutal)
    const absChange = Math.abs(solPrice.change24h || 0);
    const solMult = absChange > 10 ? 1.5 : absChange > 5 ? 1.3 : absChange > 2 ? 1.15 : 1.0;
    const totalMult = floorMult * solMult;
    for (const e of enemies) {
      const factory = ENEMY_FACTORIES[e.type] || ENEMY_FACTORIES.security_guard;
      const eid = factory(
        state.ecs,
        e.x * TILE + TILE / 2,
        e.y * TILE + TILE / 2
      );
      // Scale enemy stats with floor + SOL volatility
      if (totalMult > 1) {
        const h = state.ecs.get(eid, 'health');
        if (h) { h.current = Math.round(h.current * totalMult); h.max = Math.round(h.max * totalMult); }
        const a = state.ecs.get(eid, 'ai');
        if (a) {
          a.attackDamage = Math.round(a.attackDamage * totalMult);
          if (solMult > 1) a.speed = Math.round((a.speed || 40) * (1 + (solMult - 1) * 0.5));
        }
      }
      this.spawnedEntityIds.push(eid);
    }

    // Spawn props
    for (const p of tmpl.props) {
      const pid = createProp(
        state.ecs,
        p.x * TILE + TILE / 2,
        p.y * TILE + TILE / 2,
        p.type
      );
      if (pid !== null) this.spawnedEntityIds.push(pid);
    }

    // Spawn boss in boss rooms (skip if already cleared)
    if (room.type === 'boss' && !room.cleared) {
      const cx = Math.floor(tmpl.width / 2);
      const cy = Math.floor(tmpl.height / 2);
      // Final floor (3) spawns The Warden, otherwise Commander
      const createBoss = this.floorNumber >= 3 ? createWarden : createCommander;
      const bid = createBoss(
        state.ecs,
        cx * TILE + TILE / 2,
        cy * TILE + TILE / 2
      );
      // Scale boss stats with floor
      if (floorMult > 1) {
        const h = state.ecs.get(bid, 'health');
        if (h) { h.current = Math.round(h.current * floorMult); h.max = Math.round(h.max * floorMult); }
        const a = state.ecs.get(bid, 'ai');
        if (a) a.attackDamage = Math.round(a.attackDamage * floorMult);
      }
      this.spawnedEntityIds.push(bid);
    }

    // Spawn weapons (if template has them)
    if (tmpl.weapons) {
      for (const w of tmpl.weapons) {
        const wid = createWeaponPickup(
          state.ecs,
          w.x * TILE + TILE / 2,
          w.y * TILE + TILE / 2,
          w.type
        );
        if (wid !== null) this.spawnedEntityIds.push(wid);
      }
    }

    // Spawn upgrades (if template has them)
    if (tmpl.upgrades) {
      for (const u of tmpl.upgrades) {
        const uid = createUpgradePickup(
          state.ecs,
          u.x * TILE + TILE / 2,
          u.y * TILE + TILE / 2,
          u.type
        );
        if (uid !== null) this.spawnedEntityIds.push(uid);
      }
    }

    // Position player at entry point
    const playerPos = state.ecs.get(state.playerId, 'position');
    if (playerPos) {
      if (entryDir) {
        // Place player at the opposite side of where they came from
        const oppositeDir = DIRS.find(d => d.door === entryDir).opposite;
        const doorTiles = tmpl.doors[oppositeDir];
        if (doorTiles && doorTiles.length > 0) {
          // Average door position
          let dx = 0, dy = 0;
          for (const dt of doorTiles) { dx += dt.x; dy += dt.y; }
          dx /= doorTiles.length;
          dy /= doorTiles.length;
          // Offset inward from the door
          const inward = DIRS.find(d => d.door === oppositeDir);
          playerPos.x = (dx - inward.dx * 3) * TILE + TILE / 2;
          playerPos.y = (dy - inward.dy * 3) * TILE + TILE / 2;
        }
      } else {
        // Use template's default spawn
        playerPos.x = tmpl.playerSpawn.x * TILE + TILE / 2;
        playerPos.y = tmpl.playerSpawn.y * TILE + TILE / 2;
      }
    }

    // Boss room: add elevator trigger at center for floor progression
    if (room.type === 'boss') {
      const cx = Math.floor(tmpl.width / 2) * TILE;
      const cy = Math.floor(tmpl.height / 2) * TILE;
      state.doorTriggers.push({
        x: cx - TILE,
        y: cy - TILE,
        w: TILE * 2,
        h: TILE * 2,
        targetRoom: 'next_floor',
        doorDir: 'elevator',
      });
    }

    // Add glow lights at active doors
    for (const trigger of state.doorTriggers) {
      const isElevator = trigger.doorDir === 'elevator';
      state.lighting.addLight({
        x: trigger.x + trigger.w / 2,
        y: trigger.y + trigger.h / 2,
        radius: isElevator ? 45 : 35,
        color: isElevator ? 'rgba(255, 200, 50, 0.5)' : 'rgba(100, 200, 255, 0.4)',
        intensity: 1,
      });
    }

    // Generate decorative neon wires
    state.wires = this.generateWires(roomIndex, tilemap, tmpl);
    // Generate ambient fog and steam vents
    const atmo = this.generateAtmosphere(roomIndex, tilemap, tmpl);
    state.fogPatches = atmo.fog;
    state.steamVents = atmo.steam;
    // Generate underground dirt/flora patches
    state.groundPatches = this.generateGroundPatches(roomIndex, tilemap, tmpl);

    // Add faint white lights at steam vent positions
    for (const vent of atmo.steam) {
      state.lighting.addLight({
        x: vent.x,
        y: vent.y,
        radius: 25,
        color: 'rgba(200, 220, 240, 0.3)',
        intensity: 1,
      });
    }

    // Add bioluminescent glow under flora & alien patches
    const floraColors = [
      'rgba(80, 140, 255, 0.2)',   // blue mushroom
      'rgba(160, 80, 220, 0.18)',  // purple flower
      'rgba(80, 220, 100, 0.2)',   // green moss
      'rgba(60, 200, 210, 0.18)',  // cyan fungi
      'rgba(140, 80, 240, 0.18)',  // violet crystal
      'rgba(60, 210, 180, 0.2)',   // teal lichen
    ];
    const alienColors = [
      'rgba(255, 60, 180, 0.3)',   // neon pink tendril
      'rgba(255, 140, 40, 0.28)',  // orange coral
      'rgba(200, 255, 60, 0.3)',   // yellow-green spore
      'rgba(50, 160, 255, 0.35)',  // electric blue crystal
      'rgba(230, 50, 200, 0.3)',   // magenta jellyfish
      'rgba(255, 50, 60, 0.28)',   // red flytrap
      'rgba(220, 240, 255, 0.3)',  // white dandelion
      'rgba(180, 50, 255, 0.32)',  // purple vortex
      'rgba(50, 255, 100, 0.3)',   // neon green tentacle
      'rgba(255, 200, 50, 0.3)',   // golden sunburst
      'rgba(50, 230, 200, 0.3)',   // teal bubble
      'rgba(160, 60, 255, 0.32)',  // violet crystal tree
    ];
    for (const patch of state.groundPatches) {
      if (patch.type === 'flora') {
        state.lighting.addLight({
          x: patch.x + TILE / 2,
          y: patch.y + TILE / 2,
          radius: 20,
          color: floraColors[patch.tileIndex % floraColors.length],
          intensity: 1,
        });
      } else if (patch.type === 'alien') {
        state.lighting.addLight({
          x: patch.x + TILE / 2,
          y: patch.y + TILE / 2,
          radius: 28,
          color: alienColors[patch.tileIndex % alienColors.length],
          intensity: 1,
        });
      }
    }

    // Cryo pod decor for start room
    if (tmpl.cryoPod) {
      const podX = tmpl.cryoPod.tx * TILE + TILE / 2;
      const podY = tmpl.cryoPod.ty * TILE + TILE / 2;
      const shards = [];
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 22;
        shards.push({
          x: podX + Math.cos(angle) * dist,
          y: podY + Math.sin(angle) * dist,
          w: 1 + Math.random() * 3,
          h: 1 + Math.random() * 2,
          rot: Math.random() * Math.PI,
          alpha: 0.25 + Math.random() * 0.35,
        });
      }
      state.cryoPod = { x: podX, y: podY, shards };
    } else {
      state.cryoPod = null;
    }

    // Update camera bounds
    state.camera.setBounds(0, 0, tmpl.width * TILE, tmpl.height * TILE);

    // Mark static layer for rebuild
    state._staticDirty = true;

    // Boss room cutscene triggers
    if (room.type === 'boss' && state.cutscene && state.cutsceneFlags) {
      const flagKey = `boss_${this.floorNumber}`;
      if (!state.cutsceneFlags.bossIntro[flagKey]) {
        state.cutsceneFlags.bossIntro[flagKey] = true;
        // Import scripts dynamically via state
        if (state._scripts) {
          const script = this.floorNumber >= 3 ? state._scripts.final_boss : state._scripts.boss_intro;
          if (script) state.cutscene.play(script, state);
        }
      }
    }
  }

  // Generate decorative wire paths for a room
  generateWires(roomIndex, tilemap, tmpl) {
    // Seeded PRNG (mulberry32)
    let seed = (roomIndex + 1) * 2654435761;
    const rng = () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    // Collect wall-adjacent floor tiles (wire attachment points)
    const edgeTiles = [];
    for (let y = 1; y < tmpl.height - 1; y++) {
      for (let x = 1; x < tmpl.width - 1; x++) {
        if (tilemap.isSolid(x, y)) continue;
        // Check if any neighbor is a wall
        if (tilemap.isSolid(x - 1, y) || tilemap.isSolid(x + 1, y) ||
            tilemap.isSolid(x, y - 1) || tilemap.isSolid(x, y + 1)) {
          edgeTiles.push({ x, y });
        }
      }
    }
    if (edgeTiles.length < 4) return [];

    const wireCount = 3 + Math.floor(rng() * 3); // 3-5 wires
    const wires = [];

    for (let w = 0; w < wireCount; w++) {
      // Pick start and end from edge tiles
      const si = Math.floor(rng() * edgeTiles.length);
      let ei = Math.floor(rng() * edgeTiles.length);
      if (ei === si) ei = (ei + 1) % edgeTiles.length;
      const start = edgeTiles[si];
      const end = edgeTiles[ei];

      // Build control points
      const points = [{ x: start.x * TILE + TILE / 2, y: start.y * TILE + TILE / 2 }];
      const midCount = 1 + Math.floor(rng() * 3); // 1-3 midpoints
      for (let m = 0; m < midCount; m++) {
        const t = (m + 1) / (midCount + 1);
        const mx = start.x + (end.x - start.x) * t;
        const my = start.y + (end.y - start.y) * t;
        // Offset for organic curves
        const ox = (rng() - 0.5) * 3;
        const oy = (rng() - 0.5) * 3;
        points.push({ x: (mx + ox) * TILE + TILE / 2, y: (my + oy) * TILE + TILE / 2 });
      }
      points.push({ x: end.x * TILE + TILE / 2, y: end.y * TILE + TILE / 2 });

      wires.push({ points });
    }
    return wires;
  }

  // Generate ambient fog patches and steam vents for a room
  generateAtmosphere(roomIndex, tilemap, tmpl) {
    // Seeded PRNG (different seed than wires)
    let seed = (roomIndex + 1) * 1597334677;
    const rng = () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    const fog = [];
    const steam = [];

    // ~70% of rooms get fog
    if (rng() < 0.7) {
      const count = 3 + Math.floor(rng() * 3); // 3-5 patches
      for (let i = 0; i < count; i++) {
        // Pick a random floor tile
        let fx, fy, attempts = 0;
        do {
          fx = 2 + Math.floor(rng() * (tmpl.width - 4));
          fy = 2 + Math.floor(rng() * (tmpl.height - 4));
          attempts++;
        } while (tilemap.isSolid(fx, fy) && attempts < 20);
        if (attempts >= 20) continue;

        fog.push({
          x: fx * TILE + TILE / 2,
          y: fy * TILE + TILE / 2,
          radius: 60 + rng() * 50,
          driftX: (rng() - 0.5) * 5,
          driftY: (rng() - 0.5) * 4,
          phase: rng() * Math.PI * 2,
        });
      }
    }

    // ~60% of rooms get steam vents
    if (rng() < 0.6) {
      // Find wall-adjacent floor tiles
      const edgeTiles = [];
      for (let y = 1; y < tmpl.height - 1; y++) {
        for (let x = 1; x < tmpl.width - 1; x++) {
          if (tilemap.isSolid(x, y)) continue;
          // Determine which wall neighbor exists
          const wallN = tilemap.isSolid(x, y - 1);
          const wallS = tilemap.isSolid(x, y + 1);
          const wallW = tilemap.isSolid(x - 1, y);
          const wallE = tilemap.isSolid(x + 1, y);
          if (wallN || wallS || wallW || wallE) {
            // Steam shoots away from the wall
            let dirY = 0, dirX = 0;
            if (wallN) dirY = 1;
            else if (wallS) dirY = -1;
            else if (wallW) dirX = 1;
            else if (wallE) dirX = -1;
            edgeTiles.push({ x, y, dirX, dirY });
          }
        }
      }

      if (edgeTiles.length > 0) {
        const ventCount = 2 + Math.floor(rng() * 3); // 2-4 vents
        for (let i = 0; i < ventCount; i++) {
          const tile = edgeTiles[Math.floor(rng() * edgeTiles.length)];
          steam.push({
            x: tile.x * TILE + TILE / 2,
            y: tile.y * TILE + TILE / 2,
            dirX: tile.dirX,
            dirY: tile.dirY,
            interval: 2.5 + rng() * 3, // 2.5-5.5 seconds between bursts
            phase: rng() * 10, // offset so vents don't sync
          });
        }
      }
    }

    return { fog, steam };
  }

  // Generate random underground dirt/flora patches for a room
  generateGroundPatches(roomIndex, tilemap, tmpl) {
    // Seeded PRNG (different seed than wires/atmosphere)
    let seed = (roomIndex + 1) * 3141592653;
    const rng = () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    const patches = [];

    // ~85% of rooms get ground patches
    if (rng() > 0.85) return patches;

    // Determine patch count based on room area (bigger rooms → more patches)
    const area = tmpl.width * tmpl.height;
    const minPatches = 3;
    const maxPatches = Math.min(12, Math.floor(area / 18));
    const count = minPatches + Math.floor(rng() * (maxPatches - minPatches + 1));

    for (let i = 0; i < count; i++) {
      // Find a random floor tile that isn't a wall
      let fx, fy, attempts = 0;
      do {
        fx = 2 + Math.floor(rng() * (tmpl.width - 4));
        fy = 2 + Math.floor(rng() * (tmpl.height - 4));
        attempts++;
      } while (tilemap.isSolid(fx, fy) && attempts < 30);
      if (attempts >= 30) continue;

      // 35% dirt, 30% flora, 35% alien flora
      const roll = rng();
      let type, tileIndex;
      if (roll < 0.35) {
        type = 'dirt';
        tileIndex = Math.floor(rng() * 6);
      } else if (roll < 0.65) {
        type = 'flora';
        tileIndex = Math.floor(rng() * 6);
      } else {
        type = 'alien';
        tileIndex = Math.floor(rng() * 12);
      }

      patches.push({
        x: fx * TILE,
        y: fy * TILE,
        type,
        tileIndex,
        alpha: type === 'dirt' ? 0.5 + rng() * 0.3
             : type === 'alien' ? 0.7 + rng() * 0.25
             : 0.6 + rng() * 0.3,
      });
    }

    return patches;
  }

  // Remove all spawned entities from current room
  cleanupEntities(state) {
    for (const eid of this.spawnedEntityIds) {
      state.ecs.destroy(eid);
    }
    this.spawnedEntityIds = [];

    // Clear blood pools from previous room
    if (state.bloodPools) state.bloodPools.clear();

    // Also clean up any leftover pickups/projectiles
    const pickups = [...state.ecs.queryTag('pickup')];
    for (const pid of pickups) {
      state.ecs.destroy(pid);
    }
    const projectiles = [...state.ecs.queryTag('projectile')];
    for (const pid of projectiles) {
      state.ecs.destroy(pid);
    }
    const hazards = [...state.ecs.queryTag('hazard')];
    for (const hid of hazards) {
      state.ecs.destroy(hid);
    }
  }

  // Check if all enemies are dead — fires once per room
  checkRoomCleared(state) {
    const room = this.rooms[this.currentRoomIndex];
    if (!room || room.cleared) return false;

    // Use same global enemy tag query as HUD to guarantee consistency
    const enemies = state.ecs.queryTag('enemy');
    for (const eid of enemies) {
      const ai = state.ecs.get(eid, 'ai');
      if (ai && ai.state !== 'dead') return false;
    }

    // Non-combat rooms (no enemies in template, not a boss room): clear silently
    const tmpl = room.template;
    const isCombat = (tmpl.enemies && tmpl.enemies.length > 0) || room.type === 'boss';
    if (!isCombat) {
      room.cleared = true;
      return false;
    }

    room.cleared = true;
    if (state.menus) state.menus.stats.roomsCleared++;
    return true; // newly cleared this frame — show banner
  }

  // Check if player is touching any door trigger
  checkDoorTransition(state) {
    if (this.transitioning) return;

    // Block door use while in combat (attacking, hurt, dashing, grabbing, etc.)
    const player = state.ecs.get(state.playerId, 'player');
    if (player && player.state !== 'idle') return;

    const pos = state.ecs.get(state.playerId, 'position');
    const col = state.ecs.get(state.playerId, 'collider');
    if (!pos || !col) return;

    const px = pos.x + col.offsetX;
    const py = pos.y + col.offsetY;

    for (const trigger of (state.doorTriggers || [])) {
      if (
        px < trigger.x + trigger.w &&
        px + col.w > trigger.x &&
        py < trigger.y + trigger.h &&
        py + col.h > trigger.y
      ) {
        // Must clear room before leaving
        const room = this.rooms[this.currentRoomIndex];
        if (!room.cleared) return;

        // Block leaving start room until tutorial is completed
        if (room.type === 'start' && state.hud && state.hud._tutActive && !state.hud._tutCompleted) {
          if (!state.hud.banner) {
            state.hud.showBanner('COMPLETE TRAINING', 1.5, '#f59e0b');
          }
          return;
        }

        // Boss room cleared = advance to next floor
        if (trigger.targetRoom === 'next_floor') {
          this.advanceFloor(state);
          return;
        }

        this.startTransition(trigger.targetRoom, trigger.doorDir);
        return;
      }
    }
  }

  advanceFloor(state) {
    this.transitioning = true;
    this.transitionAlpha = 0;
    this.transitionPhase = 'fadeOut';
    this.transitionTarget = 'next_floor';
    this.transitionDoorDir = null;
  }

  startTransition(targetRoom, doorDir) {
    this.transitioning = true;
    this.transitionAlpha = 0;
    this.transitionTarget = targetRoom;
    this.transitionDoorDir = doorDir;
    this.transitionPhase = 'fadeOut'; // fadeOut -> load -> fadeIn
  }

  updateTransition(dt, state) {
    if (!this.transitioning) return;

    const speed = 3; // transition speed

    if (this.transitionPhase === 'fadeOut') {
      this.transitionAlpha += dt * speed;
      if (this.transitionAlpha >= 1) {
        this.transitionAlpha = 1;
        this.transitionPhase = 'load';
      }
    } else if (this.transitionPhase === 'load') {
      if (this.transitionTarget === 'next_floor') {
        // Generate new floor
        this.floorNumber++;
        if (state.menus) state.menus.stats.floorReached = this.floorNumber;
        this.rooms = [];
        this.grid = new Map();
        this.connections = [];
        this.generate();
        this.loadRoom(0, state, null);
        if (state.hud) state.hud.addPopup(`FLOOR ${this.floorNumber}`, 240, 135, '#4cf');
        // Floor transition cutscene
        if (state.cutscene && state._scripts && state._scripts.floor_transition) {
          state.cutscene.play(state._scripts.floor_transition, state);
        }
      } else {
        // Load the new room
        this.loadRoom(this.transitionTarget, state, this.transitionDoorDir);
      }
      this.transitionPhase = 'fadeIn';
    } else if (this.transitionPhase === 'fadeIn') {
      this.transitionAlpha -= dt * speed;
      if (this.transitionAlpha <= 0) {
        this.transitionAlpha = 0;
        this.transitioning = false;
      }
    }
  }

  renderTransition(ctx, vw) {
    if (!this.transitioning && this.transitionAlpha <= 0) return;
    ctx.fillStyle = `rgba(0, 0, 0, ${this.transitionAlpha})`;
    ctx.fillRect(0, 0, vw || 480, 270);
  }
}
