const CACHE_VERSION = 'breakout-v2';

// App shell — pre-cached on install for instant offline boot
const APP_SHELL = [
  './',
  './index.html',
  './version.json',
  './main.js',
  './wallet.js',
  './manifest.json',
  './jup-logo.webp',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Engine
  './engine/game.js',
  './engine/ecs.js',
  './engine/input.js',
  './engine/camera.js',
  './engine/renderer.js',
  './engine/physics.js',
  './engine/particles.js',
  './engine/sprites.js',
  './engine/character-sprites.js',
  './engine/audio.js',
  './engine/blood-pools.js',
  './engine/hit-effects.js',
  './engine/postprocess.js',
  './engine/sol-price.js',
  // Entities
  './entities/player.js',
  './entities/enemies.js',
  './entities/weapons.js',
  './entities/pickups.js',
  './entities/props.js',
  // Systems
  './systems/movement.js',
  './systems/combat.js',
  './systems/ai.js',
  './systems/juice.js',
  './systems/destruction.js',
  './systems/entity-collision.js',
  './systems/lighting.js',
  './systems/fire.js',
  // UI
  './ui/hud.js',
  './ui/menus.js',
  // World
  './world/floor-gen.js',
  './world/room-templates.js',
  './world/tilemap.js',
  // Cutscene
  './cutscene/cutscene-engine.js',
  './cutscene/dialogue-box.js',
  './cutscene/scripts/all-scripts.js',
  // Tileset
  './assets/tileset/lab_tileset.png',
  './assets/tileset/lab_tileset_metadata.json',
  // Decor sprites
  './engine/decor-sprites.js',
  './assets/decor/dirt_0.png',
  './assets/decor/dirt_1.png',
  './assets/decor/dirt_2.png',
  './assets/decor/dirt_3.png',
  './assets/decor/dirt_4.png',
  './assets/decor/dirt_5.png',
  './assets/decor/flora_0.png',
  './assets/decor/flora_1.png',
  './assets/decor/flora_2.png',
  './assets/decor/flora_3.png',
  './assets/decor/flora_4.png',
  './assets/decor/flora_5.png',
  './assets/decor/alien_0.png',
  './assets/decor/alien_1.png',
  './assets/decor/alien_2.png',
  './assets/decor/alien_3.png',
  './assets/decor/alien_4.png',
  './assets/decor/alien_5.png',
  './assets/decor/alien_6.png',
  './assets/decor/alien_7.png',
  './assets/decor/alien_8.png',
  './assets/decor/alien_9.png',
  './assets/decor/alien_10.png',
  './assets/decor/alien_11.png',
];

// ------- Install: pre-cache app shell -------
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ------- Activate: purge old caches -------
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ------- Fetch: strategy per request type -------
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-only for external API calls (Jupiter price, etc.)
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request)
      )
    );
    return;
  }

  // Skip caching the large video file — stream it directly
  if (url.pathname.endsWith('.mp4')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for all local assets (sprites, effects, pickups, JS, HTML)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        // Only cache successful same-origin GET requests
        if (!response || response.status !== 200 || e.request.method !== 'GET') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(e.request, clone));
        return response;
      });
    })
  );
});
