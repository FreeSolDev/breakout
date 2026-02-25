// Room templates for roguelike floor generation
// Layout legend: # = wall, . = floor, N/S/E/W = door (floor + door marker)
// All coordinates in tile units (multiply by TILE for pixels)
// Door openings are always 3 tiles across, 1 tile deep

function parseLayout(strings) {
  const rows = strings.trim().split('\n').map(r => r.trim());
  const height = rows.length;
  const width = rows[0].length;
  const walls = [];
  const doors = { N: [], S: [], E: [], W: [] };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      if (ch === '#') {
        walls.push({ x, y });
      } else if (ch === 'N') {
        doors.N.push({ x, y });
      } else if (ch === 'S') {
        doors.S.push({ x, y });
      } else if (ch === 'E') {
        doors.E.push({ x, y });
      } else if (ch === 'W') {
        doors.W.push({ x, y });
      }
    }
  }
  return { width, height, walls, doors };
}

// ──────────────────────────────────────────────
// 1. Small Combat Arena (15x10)
// ──────────────────────────────────────────────
const smallArena = {
  name: 'Small Combat Arena',
  type: 'combat',
  ...parseLayout(`
###############
#.....NNN.....#
#.............#
#.............#
W.............E
W.............E
W.............E
#.............#
#.....SSS.....#
###############`),
  enemies: [
    { x: 4, y: 3, type: 'security_guard' },
    { x: 10, y: 3, type: 'lab_mutant' },
    { x: 7, y: 6, type: 'security_guard' },
  ],
  extraSpawnPoints: [
    { x: 5, y: 5 }, { x: 9, y: 5 }, { x: 3, y: 4 },
    { x: 11, y: 4 }, { x: 7, y: 2 }, { x: 7, y: 7 },
  ],
  props: [
    { x: 3, y: 2, type: 'barrel' },
    { x: 11, y: 7, type: 'barrel' },
  ],
  lights: [
    { x: 7, y: 5, radius: 55, color: 'rgba(255, 250, 230, 0.5)' },
  ],
  playerSpawn: { x: 7, y: 8 },
};

// ──────────────────────────────────────────────
// 2. Large Combat Arena (20x14)
// ──────────────────────────────────────────────
const largeArena = {
  name: 'Large Combat Arena',
  type: 'combat',
  ...parseLayout(`
####################
#.......NNN........#
#..................#
#...##......##.....#
#...##......##.....#
#..................#
W..................E
W..................E
W..................E
#...##......##.....#
#...##......##.....#
#..................#
#.......SSS........#
####################`),
  enemies: [
    { x: 5, y: 3, type: 'security_guard' },
    { x: 14, y: 3, type: 'riot_soldier' },
    { x: 10, y: 7, type: 'mech_soldier' },
    { x: 5, y: 11, type: 'security_guard' },
    { x: 14, y: 11, type: 'lab_mutant' },
  ],
  extraSpawnPoints: [
    { x: 8, y: 6 }, { x: 12, y: 6 }, { x: 8, y: 8 },
    { x: 12, y: 8 }, { x: 3, y: 7 }, { x: 16, y: 7 },
  ],
  props: [
    { x: 3, y: 2, type: 'barrel' },
    { x: 16, y: 2, type: 'barrel' },
    { x: 3, y: 12, type: 'barrel' },
    { x: 16, y: 12, type: 'barrel' },
  ],
  lights: [
    { x: 10, y: 4, radius: 50, color: 'rgba(255, 250, 230, 0.45)' },
    { x: 10, y: 10, radius: 50, color: 'rgba(255, 250, 230, 0.45)' },
    { x: 4, y: 7, radius: 40, color: 'rgba(100, 150, 255, 0.35)' },
    { x: 16, y: 7, radius: 40, color: 'rgba(100, 150, 255, 0.35)' },
  ],
  playerSpawn: { x: 10, y: 12 },
};

// ──────────────────────────────────────────────
// 3. Lab Room (18x12)
// ──────────────────────────────────────────────
const labRoom = {
  name: 'Lab Room',
  type: 'combat',
  ...parseLayout(`
##################
#......NNN.......#
#................#
#...##....##.....#
#...##....##.....#
W................E
W................E
W................E
#...##....##.....#
#................#
#......SSS.......#
##################`),
  enemies: [
    { x: 3, y: 3, type: 'scientist' },
    { x: 14, y: 3, type: 'scientist' },
    { x: 9, y: 6, type: 'drone' },
    { x: 3, y: 8, type: 'security_guard' },
  ],
  extraSpawnPoints: [
    { x: 8, y: 5 }, { x: 13, y: 6 }, { x: 3, y: 5 },
    { x: 14, y: 9 }, { x: 9, y: 9 }, { x: 7, y: 2 },
  ],
  props: [
    { x: 5, y: 3, type: 'desk' },
    { x: 12, y: 3, type: 'desk' },
    { x: 5, y: 8, type: 'desk' },
    { x: 12, y: 8, type: 'desk' },
    { x: 9, y: 2, type: 'monitor' },
    { x: 9, y: 9, type: 'monitor' },
  ],
  lights: [
    { x: 5, y: 3, radius: 35, color: 'rgba(100, 255, 150, 0.3)' },
    { x: 12, y: 3, radius: 35, color: 'rgba(100, 255, 150, 0.3)' },
    { x: 9, y: 6, radius: 50, color: 'rgba(200, 200, 255, 0.4)' },
  ],
  playerSpawn: { x: 9, y: 10 },
};

// ──────────────────────────────────────────────
// 4. Corridor (25x8)
// ──────────────────────────────────────────────
const corridor = {
  name: 'Corridor',
  type: 'combat',
  ...parseLayout(`
#########################
#..........NNN..........#
#.......................#
W.......................E
W.......................E
W.......................E
#..........SSS..........#
#########################`),
  enemies: [
    { x: 6, y: 3, type: 'security_guard' },
    { x: 12, y: 4, type: 'lab_mutant' },
    { x: 18, y: 3, type: 'drone' },
  ],
  extraSpawnPoints: [
    { x: 4, y: 4 }, { x: 8, y: 3 }, { x: 14, y: 4 },
    { x: 20, y: 4 }, { x: 10, y: 3 }, { x: 16, y: 4 },
  ],
  props: [
    { x: 3, y: 2, type: 'barrel' },
    { x: 9, y: 5, type: 'barrel' },
    { x: 15, y: 2, type: 'barrel' },
    { x: 21, y: 5, type: 'barrel' },
  ],
  lights: [
    { x: 6, y: 4, radius: 40, color: 'rgba(255, 200, 100, 0.35)' },
    { x: 12, y: 4, radius: 40, color: 'rgba(255, 200, 100, 0.35)' },
    { x: 18, y: 4, radius: 40, color: 'rgba(255, 200, 100, 0.35)' },
  ],
  playerSpawn: { x: 2, y: 4 },
};

// ──────────────────────────────────────────────
// 5. Storage Room (15x12)
// ──────────────────────────────────────────────
const storageRoom = {
  name: 'Storage Room',
  type: 'combat',
  ...parseLayout(`
###############
#.....NNN.....#
#.............#
#.............#
#..##...##....#
W..##...##....E
W.............E
W..##...##....E
#..##...##....#
#.............#
#.....SSS.....#
###############`),
  enemies: [
    { x: 7, y: 3, type: 'riot_soldier' },
    { x: 7, y: 6, type: 'security_guard' },
    { x: 7, y: 9, type: 'lab_mutant' },
  ],
  extraSpawnPoints: [
    { x: 5, y: 6 }, { x: 10, y: 6 }, { x: 5, y: 3 },
    { x: 10, y: 3 }, { x: 5, y: 9 }, { x: 10, y: 9 },
  ],
  props: [
    { x: 4, y: 4, type: 'barrel' },
    { x: 10, y: 4, type: 'barrel' },
    { x: 4, y: 7, type: 'barrel' },
    { x: 10, y: 7, type: 'barrel' },
    { x: 7, y: 2, type: 'barrel' },
    { x: 7, y: 9, type: 'barrel' },
  ],
  lights: [
    { x: 7, y: 6, radius: 55, color: 'rgba(255, 100, 50, 0.35)' },
  ],
  playerSpawn: { x: 7, y: 10 },
};

// ──────────────────────────────────────────────
// 6. Security Checkpoint (20x10)
// ──────────────────────────────────────────────
const securityCheckpoint = {
  name: 'Security Checkpoint',
  type: 'combat',
  ...parseLayout(`
####################
#.......NNN........#
#..................#
#....####..####....#
W....#........#....E
W....#........#....E
W....####..####....E
#..................#
#.......SSS........#
####################`),
  enemies: [
    { x: 10, y: 4, type: 'riot_soldier' },
    { x: 10, y: 5, type: 'mech_soldier' },
    { x: 3, y: 4, type: 'security_guard' },
    { x: 16, y: 4, type: 'security_guard' },
  ],
  extraSpawnPoints: [
    { x: 3, y: 7 }, { x: 16, y: 7 }, { x: 8, y: 2 },
    { x: 12, y: 2 }, { x: 7, y: 5 }, { x: 13, y: 4 },
  ],
  props: [
    { x: 3, y: 2, type: 'desk' },
    { x: 16, y: 2, type: 'desk' },
    { x: 3, y: 7, type: 'barrel' },
    { x: 16, y: 7, type: 'barrel' },
  ],
  lights: [
    { x: 10, y: 5, radius: 40, color: 'rgba(255, 50, 50, 0.4)' },
    { x: 3, y: 5, radius: 35, color: 'rgba(255, 250, 230, 0.35)' },
    { x: 16, y: 5, radius: 35, color: 'rgba(255, 250, 230, 0.35)' },
  ],
  playerSpawn: { x: 10, y: 8 },
};

// ──────────────────────────────────────────────
// 7. Weapon Cache (10x8) — lots of weapons, few enemies
// ──────────────────────────────────────────────
const weaponCache = {
  name: 'Weapon Cache',
  type: 'cache',
  ...parseLayout(`
##########
#..NNN...#
#........#
W........E
W........E
W........E
#..SSS...#
##########`),
  enemies: [
    { x: 5, y: 3, type: 'security_guard' },
  ],
  props: [],
  weapons: [
    { x: 2, y: 2, type: 'pipe' },
    { x: 7, y: 2, type: 'baton' },
    { x: 2, y: 5, type: 'stun_rod' },
    { x: 7, y: 5, type: 'fire_extinguisher' },
  ],
  lights: [
    { x: 5, y: 4, radius: 50, color: 'rgba(255, 220, 100, 0.5)' },
  ],
  playerSpawn: { x: 5, y: 6 },
};

// ──────────────────────────────────────────────
// 8. Rest Room (10x8) — safe, vending machines, no enemies
// ──────────────────────────────────────────────
const restRoom = {
  name: 'Rest Room',
  type: 'rest',
  ...parseLayout(`
##########
#..NNN...#
#........#
W........E
W........E
W........E
#..SSS...#
##########`),
  enemies: [],
  props: [
    { x: 2, y: 2, type: 'vending' },
    { x: 7, y: 2, type: 'vending' },
  ],
  lights: [
    { x: 5, y: 4, radius: 60, color: 'rgba(100, 200, 255, 0.45)' },
    { x: 2, y: 2, radius: 25, color: 'rgba(100, 255, 100, 0.3)' },
    { x: 7, y: 2, radius: 25, color: 'rgba(100, 255, 100, 0.3)' },
  ],
  playerSpawn: { x: 5, y: 6 },
};

// ──────────────────────────────────────────────
// 9. Boss Room (25x18) — large open arena
// ──────────────────────────────────────────────
const bossRoom = {
  name: 'Boss Room',
  type: 'boss',
  ...parseLayout(`
#########################
#..........NNN..........#
#.......................#
#...##.............##...#
#...##.............##...#
#.......................#
#.......................#
W.......................E
W.......................E
W.......................E
#.......................#
#.......................#
#...##.............##...#
#...##.............##...#
#.......................#
#.......................#
#..........SSS..........#
#########################`),
  enemies: [], // Boss spawned by floor gen
  props: [
    { x: 5, y: 3, type: 'barrel' },
    { x: 19, y: 3, type: 'barrel' },
    { x: 5, y: 14, type: 'barrel' },
    { x: 19, y: 14, type: 'barrel' },
  ],
  lights: [
    { x: 12, y: 9, radius: 70, color: 'rgba(255, 50, 50, 0.35)' },
    { x: 5, y: 5, radius: 35, color: 'rgba(255, 200, 100, 0.3)' },
    { x: 19, y: 5, radius: 35, color: 'rgba(255, 200, 100, 0.3)' },
    { x: 5, y: 13, radius: 35, color: 'rgba(255, 200, 100, 0.3)' },
    { x: 19, y: 13, radius: 35, color: 'rgba(255, 200, 100, 0.3)' },
  ],
  playerSpawn: { x: 12, y: 16 },
};

// ──────────────────────────────────────────────
// 10. Cryo Lab (18x14) — starting room, player wakes in broken pod
// ──────────────────────────────────────────────
const cryoLab = {
  name: 'Cryo Lab',
  type: 'start',
  ...parseLayout(`
##################
#......NNN.......#
#................#
#.##..........##.#
#.##..........##.#
#................#
W................E
W................E
W................E
#................#
#.##..........##.#
#.##..........##.#
#......SSS.......#
##################`),
  enemies: [],
  props: [
    { x: 2, y: 3, type: 'monitor' },
    { x: 15, y: 3, type: 'monitor' },
    { x: 2, y: 10, type: 'monitor' },
    { x: 15, y: 10, type: 'monitor' },
  ],
  weapons: [
    { x: 7, y: 9, type: 'pipe' },
  ],
  lights: [
    { x: 9, y: 7, radius: 55, color: 'rgba(100, 180, 255, 0.5)' },
    { x: 2, y: 3, radius: 25, color: 'rgba(100, 255, 150, 0.2)' },
    { x: 15, y: 3, radius: 25, color: 'rgba(100, 255, 150, 0.2)' },
    { x: 9, y: 1, radius: 30, color: 'rgba(255, 60, 60, 0.2)' },
    { x: 9, y: 12, radius: 30, color: 'rgba(255, 60, 60, 0.2)' },
  ],
  playerSpawn: { x: 9, y: 7 },
  cryoPod: { tx: 9, ty: 7 },
};

// ──────────────────────────────────────────────
// 11. Long Horizontal Corridor (30x6) — rest passage
// ──────────────────────────────────────────────
const longCorridorH = {
  name: 'Maintenance Tunnel',
  type: 'corridor',
  axis: 'horizontal',
  ...parseLayout(`
##############################
#NNN.........................#
W............................E
W............................E
W........................SSS.E
##############################`),
  enemies: [],
  props: [],
  lights: [
    { x: 5, y: 3, radius: 30, color: 'rgba(200, 180, 120, 0.25)' },
    { x: 15, y: 3, radius: 30, color: 'rgba(200, 180, 120, 0.25)' },
    { x: 25, y: 3, radius: 30, color: 'rgba(200, 180, 120, 0.25)' },
  ],
  playerSpawn: { x: 2, y: 3 },
};

// ──────────────────────────────────────────────
// 12. Long Vertical Corridor (7x19) — rest passage
// ──────────────────────────────────────────────
const longCorridorV = {
  name: 'Service Shaft',
  type: 'corridor',
  axis: 'vertical',
  ...parseLayout(`
#######
##NNN##
#.....E
#.....E
#.....E
#.....#
#.....#
#.....#
#.....#
#.....#
#.....#
#.....#
#.....#
W.....#
W.....#
W.....#
#.....#
##SSS##
#######`),
  enemies: [],
  props: [],
  lights: [
    { x: 3, y: 5, radius: 30, color: 'rgba(200, 180, 120, 0.25)' },
    { x: 3, y: 10, radius: 30, color: 'rgba(200, 180, 120, 0.25)' },
    { x: 3, y: 15, radius: 30, color: 'rgba(200, 180, 120, 0.25)' },
  ],
  playerSpawn: { x: 3, y: 3 },
};

// ──────────────────────────────────────────────
// Template Registry
// ──────────────────────────────────────────────

export const ROOM_TEMPLATES = {
  start: [cryoLab],
  combat: [smallArena, largeArena, labRoom, corridor, storageRoom, securityCheckpoint],
  cache: [weaponCache],
  rest: [restRoom, longCorridorH, longCorridorV],
  corridor: [longCorridorH, longCorridorV],
  boss: [bossRoom],
};

// Pick a random template by category
export function getRandomTemplate(category) {
  const pool = ROOM_TEMPLATES[category];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
