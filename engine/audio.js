// Synthesized audio system — no external files needed
// Uses Web Audio API to generate all sounds procedurally

export class AudioSystem {
  constructor() {
    this.ctx = null; // AudioContext, created on first user interaction
    this.masterGain = null;
    this.volume = 0.3;
  }

  // Must be called from a user gesture (click/keypress) to unlock audio
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);
  }

  setVolume(v) {
    this.volume = v;
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  // ── Sound generators ──

  playHit() {
    if (!this.ctx) return;
    this._noise(0.06, 800, 0.25);
  }

  playHeavyHit() {
    if (!this.ctx) return;
    this._noise(0.12, 400, 0.35);
    this._tone(80, 0.1, 'square', 0.2);
  }

  playDash() {
    if (!this.ctx) return;
    this._filteredNoise(0.15, 2000, 600, 0.15);
  }

  playExplosion() {
    if (!this.ctx) return;
    this._noise(0.25, 300, 0.4);
    this._tone(60, 0.2, 'sawtooth', 0.3);
    this._tone(40, 0.3, 'sine', 0.2);
  }

  playPickup() {
    if (!this.ctx) return;
    this._toneSweep(400, 800, 0.12, 'sine', 0.2);
  }

  playUpgrade() {
    if (!this.ctx) return;
    this._toneSweep(300, 900, 0.2, 'sine', 0.25);
    this._toneSweep(450, 1100, 0.15, 'square', 0.1);
  }

  playMenuSelect() {
    if (!this.ctx) return;
    this._tone(600, 0.08, 'square', 0.15);
  }

  playMenuConfirm() {
    if (!this.ctx) return;
    this._toneSweep(400, 700, 0.1, 'square', 0.15);
  }

  playShieldBlock() {
    if (!this.ctx) return;
    this._tone(200, 0.1, 'square', 0.2);
    this._noise(0.05, 1200, 0.15);
  }

  playProjectile() {
    if (!this.ctx) return;
    this._toneSweep(800, 400, 0.1, 'sawtooth', 0.1);
  }

  playDeath() {
    if (!this.ctx) return;
    this._toneSweep(300, 80, 0.4, 'sawtooth', 0.3);
    this._noise(0.3, 200, 0.25);
  }

  // ── Primitives ──

  _noise(duration, freq, volume) {
    const ctx = this.ctx;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration);
  }

  _filteredNoise(duration, startFreq, endFreq, volume) {
    const ctx = this.ctx;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startFreq, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);
    filter.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration);
  }

  _tone(freq, duration, type, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  _toneSweep(startFreq, endFreq, duration, type, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }
}
