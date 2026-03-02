// Ground decoration tile loader — dirt patches, bioluminescent flora & alien flora
import { loadImage } from './sprites.js';

const DECOR_BASE = './assets/decor';

const DIRT_TILES = [];    // 6 dirt tile Image objects
const FLORA_TILES = [];   // 6 flora tile Image objects
const ALIEN_TILES = [];   // 12 alien flora tile Image objects
let _loaded = false;

export async function loadDecorTiles() {
  if (_loaded) return;
  const promises = [];
  for (let i = 0; i < 6; i++) {
    promises.push(loadImage(`${DECOR_BASE}/dirt_${i}.png`).then(img => { DIRT_TILES[i] = img; }));
    promises.push(loadImage(`${DECOR_BASE}/flora_${i}.png`).then(img => { FLORA_TILES[i] = img; }));
  }
  for (let i = 0; i < 12; i++) {
    promises.push(loadImage(`${DECOR_BASE}/alien_${i}.png`).then(img => { ALIEN_TILES[i] = img; }));
  }
  await Promise.all(promises);
  _loaded = true;
}

export function getDirtTile(index) { return DIRT_TILES[index % DIRT_TILES.length]; }
export function getFloraTile(index) { return FLORA_TILES[index % FLORA_TILES.length]; }
export function getAlienTile(index) { return ALIEN_TILES[index % ALIEN_TILES.length]; }
export function decorLoaded() { return _loaded; }
