export class Game {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = width;    // game resolution (e.g., 480)
    this.height = height;  // game resolution (e.g., 270)
    // Canvas pixel dimensions = native game resolution
    // CSS handles scaling to fill the viewport (image-rendering: pixelated)
    canvas.width = width;
    canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;

    this.systems = [];
    this.running = false;
    this.timestep = 1000 / 60;
    this.lastTime = 0;
    this.accumulator = 0;
    this.maxAccumulator = 200; // Cap: prevents spiral of death
    this.frameCount = 0;
    this.fps = 0;
    this.state = {}; // shared game state
  }

  addSystem(system) { this.systems.push(system); }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() { this.running = false; }

  loop(time) {
    if (!this.running) return;
    const delta = time - this.lastTime;
    this.lastTime = time;
    this.accumulator = Math.min(this.accumulator + delta, this.maxAccumulator);

    while (this.accumulator >= this.timestep) {
      // Juice system gets first update to set hitstop flag
      const juice = this.state.juice;
      if (juice) juice.update(this.timestep / 1000, this.state);

      const scaledDt = (this.timestep / 1000) * (this.state.timeScale || 1);
      if (!this.state.hitstopActive) {
        for (const sys of this.systems) {
          if (sys === juice) continue;
          if (sys.update) sys.update(scaledDt, this.state);
        }
      } else {
        for (const sys of this.systems) {
          if (sys === juice) continue;
          if (sys.hitstopUpdate) sys.hitstopUpdate(scaledDt, this.state);
        }
      }
      this.accumulator -= this.timestep;
    }

    const interp = this.accumulator / this.timestep;

    // Render directly to canvas at native resolution (CSS handles scaling)
    this.ctx.clearRect(0, 0, this.width, this.height);
    for (const sys of this.systems) {
      if (sys.render) sys.render(this.ctx, interp, this.state);
    }

    this.frameCount++;
    requestAnimationFrame((t) => this.loop(t));
  }
}
