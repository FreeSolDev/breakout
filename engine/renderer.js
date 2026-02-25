export class Renderer {
  static drawRect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  static drawCircle(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
    ctx.fill();
  }

  static drawText(ctx, text, x, y, color = '#fff', size = 8, font = 'monospace') {
    ctx.fillStyle = color;
    ctx.font = `${size}px ${font}`;
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  // Flash white effect for impact frames
  static drawFlash(ctx, x, y, w, h) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
}
