export class SpriteSheet {
  constructor(image, frameW, frameH) {
    this.image = image;
    this.frameW = frameW;
    this.frameH = frameH;
    this.cols = Math.floor(image.width / frameW);
    this.animations = {};
  }

  defineAnim(name, frames, frameDuration, loop = true) {
    // frames = array of frame indices (left-to-right, top-to-bottom)
    this.animations[name] = { frames, frameDuration, loop };
  }

  getFrame(index) {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    return { x: col * this.frameW, y: row * this.frameH };
  }
}

export class Animator {
  constructor(spriteSheet) {
    this.sheet = spriteSheet;
    this.currentAnim = null;
    this.frameIndex = 0;
    this.timer = 0;
    this.finished = false;
  }

  play(name) {
    if (this.currentAnim === name) return;
    this.currentAnim = name;
    this.frameIndex = 0;
    this.timer = 0;
    this.finished = false;
  }

  update(dt) {
    const anim = this.sheet.animations[this.currentAnim];
    if (!anim) return;
    this.timer += dt;
    if (this.timer >= anim.frameDuration) {
      this.timer -= anim.frameDuration;
      this.frameIndex++;
      if (this.frameIndex >= anim.frames.length) {
        if (anim.loop) {
          this.frameIndex = 0;
        } else {
          this.frameIndex = anim.frames.length - 1;
          this.finished = true;
        }
      }
    }
  }

  draw(ctx, x, y, flipX = false) {
    const anim = this.sheet.animations[this.currentAnim];
    if (!anim) return;
    const frame = this.sheet.getFrame(anim.frames[this.frameIndex]);
    ctx.save();
    if (flipX) {
      ctx.translate(x + this.sheet.frameW, y);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(x, y);
    }
    ctx.drawImage(
      this.sheet.image,
      frame.x, frame.y, this.sheet.frameW, this.sheet.frameH,
      0, 0, this.sheet.frameW, this.sheet.frameH
    );
    ctx.restore();
  }
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
