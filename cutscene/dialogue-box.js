// Dialogue Box — bottom-screen text box with typewriter effect

export class DialogueBox {
  constructor() {
    this.visible = false;
    this.name = '';
    this.fullText = '';
    this.displayedChars = 0;
    this.nameColor = '#fff';
    this.charTimer = 0;
    this.charSpeed = 30; // chars per second
    this.fastSpeed = 90;
    this._complete = false;

    // Layout constants
    this.boxX = 16;
    this.boxY = 200;
    this.boxW = 448;
    this.boxH = 58;
    this.padding = 8;
    this.nameHeight = 12;
    this.touchMode = false; // set externally when touch controls are active
  }

  show(name, text, color) {
    this.visible = true;
    this.name = name || '';
    this.fullText = text || '';
    this.displayedChars = 0;
    this.nameColor = color || '#fff';
    this.charTimer = 0;
    this._complete = false;
  }

  hide() {
    this.visible = false;
    this._complete = false;
  }

  isComplete() {
    return this._complete;
  }

  skipToEnd() {
    this.displayedChars = this.fullText.length;
    this._complete = true;
  }

  update(dt, fastForward) {
    if (!this.visible || this._complete) return;

    const speed = fastForward ? this.fastSpeed : this.charSpeed;
    this.charTimer += dt * speed;

    while (this.charTimer >= 1 && this.displayedChars < this.fullText.length) {
      this.charTimer -= 1;
      this.displayedChars++;
    }

    if (this.displayedChars >= this.fullText.length) {
      this._complete = true;
    }
  }

  render(ctx, vw, vh) {
    if (!this.visible) return;

    ctx.save();

    // On narrow screens (portrait mobile), collapse margins to fill width
    const w = vw || 480;
    const margin = w < 200 ? 2 : this.boxX;
    const bw = w - margin * 2;
    const bx = margin;
    const by = (vh && vh < 270) ? vh - this.boxH - 4 : this.boxY;

    // Semi-transparent dark background
    ctx.fillStyle = 'rgba(8, 6, 16, 0.88)';
    ctx.fillRect(bx, by, bw, this.boxH);

    // Pixel border
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, this.boxH - 1);

    // Inner border highlight
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.2)';
    ctx.strokeRect(bx + 2.5, by + 2.5, bw - 5, this.boxH - 5);

    // Character name
    if (this.name) {
      ctx.fillStyle = this.nameColor;
      ctx.font = '10px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(this.name, bx + this.padding, by + this.padding);

      // Name underline
      const nameW = ctx.measureText(this.name).width;
      ctx.fillStyle = this.nameColor;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(bx + this.padding, by + this.padding + 11, nameW, 1);
      ctx.globalAlpha = 1;
    }

    // Typewriter text
    const textY = by + this.padding + (this.name ? this.nameHeight + 4 : 0);
    const displayText = this.fullText.substring(0, this.displayedChars);

    ctx.fillStyle = '#ccd';
    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';

    // Word wrap
    const maxW = bw - this.padding * 2;
    const lines = this.wrapText(ctx, displayText, maxW);
    for (let i = 0; i < lines.length && i < 3; i++) {
      ctx.fillText(lines[i], bx + this.padding, textY + i * 11);
    }

    // Button hint — show what to press/tap
    const hintX = bx + bw - this.padding;
    const hintY = by + this.boxH - 10;

    if (this._complete) {
      // Text finished — show "continue" hint
      const blink = (Math.sin(performance.now() / 300) + 1) / 2; // 0→1 pulse
      ctx.globalAlpha = 0.5 + blink * 0.4;

      if (this.touchMode) {
        // Mobile: "TAP ▸"
        ctx.font = '7px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
        ctx.fillText('TAP \u25B8', hintX, hintY);
      } else {
        // Keyboard: mini [J] / [Z] keycap + arrow
        this._drawMiniKeycap(ctx, hintX - 30, hintY, 'J');
        ctx.font = '6px monospace';
        ctx.fillStyle = '#556';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('/', hintX - 20, hintY);
        this._drawMiniKeycap(ctx, hintX - 10, hintY, 'Z');
        // Arrow
        ctx.fillStyle = 'rgba(100, 200, 255, 0.8)';
        ctx.beginPath();
        ctx.moveTo(hintX - 1, hintY - 3);
        ctx.lineTo(hintX + 4, hintY);
        ctx.lineTo(hintX - 1, hintY + 3);
        ctx.fill();
      }
    } else {
      // Text still typing — show skip hint (dimmer)
      ctx.globalAlpha = 0.3;
      if (this.touchMode) {
        ctx.font = '6px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#8af';
        ctx.fillText('TAP skip', hintX, hintY);
      } else {
        ctx.font = '6px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#8af';
        ctx.fillText('J/Z skip', hintX, hintY);
      }
    }

    ctx.restore();
  }

  // Small inline keycap for dialogue hints
  _drawMiniKeycap(ctx, x, y, label) {
    const kw = 10;
    const kh = 10;
    const kx = Math.round(x - kw / 2);
    const ky = Math.round(y - kh / 2);
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(kx, ky + 1, kw, kh);
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(kx, ky, kw, kh);
    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(kx + 1, ky + 1, kw - 2, kh - 3);
    ctx.fillStyle = '#5a5a6a';
    ctx.fillRect(kx + 1, ky + 1, kw - 2, 1);
    ctx.fillStyle = '#ddd';
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, Math.round(y));
  }

  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }
}
