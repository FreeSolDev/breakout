export class Tilemap {
  constructor(width, height, tileSize) {
    this.width = width;     // tiles across
    this.height = height;   // tiles down
    this.tileSize = tileSize;
    this.layers = {};       // name -> Uint16Array
    this.collision = new Uint8Array(width * height); // 0 = passable, 1 = solid
    this.tilesets = {};     // name -> { image, cols }
  }

  addLayer(name) {
    this.layers[name] = new Uint16Array(this.width * this.height);
  }

  setTile(layer, x, y, tileId) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.layers[layer][y * this.width + x] = tileId;
  }

  getTile(layer, x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.layers[layer][y * this.width + x];
  }

  setSolid(x, y, solid = 1) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.collision[y * this.width + x] = solid;
  }

  isSolid(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
    return this.collision[y * this.width + x] === 1;
  }

  // Check if a rect collides with any solid tiles, return list of solid rects
  getSolidRectsInArea(x, y, w, h) {
    const rects = [];
    const startX = Math.floor(x / this.tileSize);
    const startY = Math.floor(y / this.tileSize);
    const endX = Math.ceil((x + w) / this.tileSize);
    const endY = Math.ceil((y + h) / this.tileSize);
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        if (this.isSolid(tx, ty)) {
          rects.push({
            x: tx * this.tileSize,
            y: ty * this.tileSize,
            w: this.tileSize,
            h: this.tileSize
          });
        }
      }
    }
    return rects;
  }

  renderLayer(ctx, layerName, tilesetName, cameraX, cameraY, viewW, viewH) {
    const ts = this.tilesets[tilesetName];
    if (!ts) return;
    const startX = Math.max(0, Math.floor(cameraX / this.tileSize));
    const startY = Math.max(0, Math.floor(cameraY / this.tileSize));
    const endX = Math.min(this.width, Math.ceil((cameraX + viewW) / this.tileSize) + 1);
    const endY = Math.min(this.height, Math.ceil((cameraY + viewH) / this.tileSize) + 1);

    const layer = this.layers[layerName];
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const tileId = layer[ty * this.width + tx];
        if (tileId === 0) continue; // 0 = empty
        const srcX = ((tileId - 1) % ts.cols) * this.tileSize;
        const srcY = Math.floor((tileId - 1) / ts.cols) * this.tileSize;
        ctx.drawImage(
          ts.image,
          srcX, srcY, this.tileSize, this.tileSize,
          tx * this.tileSize, ty * this.tileSize, this.tileSize, this.tileSize
        );
      }
    }
  }

  renderCollision(ctx) {
    const ts = this.tileSize;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.isSolid(x, y)) continue;
        const px = x * ts;
        const py = y * ts;
        // Base wall
        ctx.fillStyle = '#2a2a3e';
        ctx.fillRect(px, py, ts, ts);
        // Top highlight
        ctx.fillStyle = '#3a3a50';
        ctx.fillRect(px, py, ts, 2);
        // Bottom shadow
        ctx.fillStyle = '#1a1a28';
        ctx.fillRect(px, py + ts - 2, ts, 2);
      }
    }
  }
}
