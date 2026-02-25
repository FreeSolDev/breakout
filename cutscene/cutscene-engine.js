// Cutscene Engine — reads JSON scripts, processes steps sequentially
// Pauses game loop updates while active

export class CutsceneEngine {
  constructor() {
    this.active = false;
    this.steps = [];
    this.currentStep = 0;
    this.stepTimer = 0;
    this.dialogue = null; // DialogueBox reference
    this.onComplete = null;

    // Step-specific state
    this._waitingForInput = false;
    this._fadeAlpha = 0;
    this._fadeTarget = 0;
    this._fadeSpeed = 0;

    // Letterbox bars (cinematic top/bottom)
    this._barHeight = 0;
    this._barTarget = 0;
    this._barStart = 0;
    this._barTimer = 0;
    this._barDuration = 0;

    // Boss rage animation
    this._anim = null;       // { type, timer, duration }
    this._rageBossId = null;  // entity ID of boss being animated
  }

  play(script, state, onComplete) {
    this.steps = script.steps || script;
    this.currentStep = 0;
    this.active = true;
    this.onComplete = onComplete || null;
    this._state = state;
    this._waitingForInput = false;
    this._fadeAlpha = 0;
    this._fadeTarget = 0;
    this._anim = null;
    this.startStep();
  }

  stop() {
    this.active = false;
    this.steps = [];
    this.currentStep = 0;
    this._barHeight = 0;
    this._barTarget = 0;
    this._anim = null;
    this._rageBossId = null;
    if (this.dialogue) this.dialogue.hide();
  }

  startStep() {
    if (this.currentStep >= this.steps.length) {
      this.active = false;
      if (this.dialogue) this.dialogue.hide();
      if (this.onComplete) this.onComplete();
      return;
    }

    const step = this.steps[this.currentStep];
    const state = this._state;

    switch (step.type) {
      case 'dialogue':
        if (this.dialogue) {
          this.dialogue.show(step.name, step.text, step.color || '#fff');
        }
        this._waitingForInput = true;
        break;

      case 'wait':
        this.stepTimer = step.duration || 1;
        this._waitingForInput = false;
        break;

      case 'fade':
        this._fadeTarget = step.to !== undefined ? step.to : (step.direction === 'in' ? 0 : 1);
        this._fadeSpeed = 1 / (step.duration || 0.5);
        this._waitingForInput = false;
        break;

      case 'camera':
        if (state && state.camera) {
          if (step.shake) {
            state.camera.shake(step.shake.intensity || 5, step.shake.duration || 0.3);
          }
        }
        this.stepTimer = step.duration || 0.3;
        this._waitingForInput = false;
        break;

      case 'action':
        // Execute action (popup, particles, etc.)
        if (step.popup && state && state.hud) {
          state.hud.addPopup(step.popup.text, step.popup.x || 240, step.popup.y || 100, step.popup.color || '#fff');
        }
        if (step.particles && state && state.particles) {
          state.particles.emit(step.particles);
        }
        this.stepTimer = step.duration || 0.1;
        this._waitingForInput = false;
        break;

      case 'letterbox':
        this._barTarget = step.to !== undefined ? step.to : 38;
        this._barStart = this._barHeight;
        this._barTimer = 0;
        this._barDuration = step.duration || 0.5;
        this._waitingForInput = false;
        break;

      case 'anim':
        this._anim = {
          type: step.anim,
          timer: 0,
          duration: step.duration || 1,
          targetScale: step.targetScale || 1.8,
        };
        this._waitingForInput = false;
        break;

      default:
        // Unknown step type, skip
        this.nextStep();
        return;
    }
  }

  nextStep() {
    this.currentStep++;
    this._waitingForInput = false;
    this.startStep();
  }

  update(dt, state) {
    if (!this.active) return false;

    const input = state.input;
    const curStep = this.steps[this.currentStep];

    // Letterbox bar animation
    if (curStep && curStep.type === 'letterbox') {
      this._barTimer += dt;
      const t = Math.min(1, this._barTimer / this._barDuration);
      // Smoothstep ease in-out
      const eased = t * t * (3 - 2 * t);
      this._barHeight = this._barStart + (this._barTarget - this._barStart) * eased;
      if (t >= 1) {
        this._barHeight = this._barTarget;
        this.nextStep();
      }
      return true;
    }

    // Boss rage animation
    if (curStep && curStep.type === 'anim' && this._anim) {
      this._anim.timer += dt;
      const gt = Math.min(1, this._anim.timer / this._anim.duration);
      const animState = this._state;
      const bossId = this._rageBossId;

      if (bossId !== null && animState) {
        const bossPos = animState.ecs?.get(bossId, 'position');
        const bossAi = animState.ecs?.get(bossId, 'ai');
        const bossCol = animState.ecs?.get(bossId, 'collider');

        // ── boss_tremble: sprite shakes in place, screen darkens ──
        if (this._anim.type === 'boss_tremble') {
          if (bossAi) {
            // Store tremble offset so renderer can shake the sprite
            bossAi._trembleX = Math.sin(gt * Math.PI * 30) * (1 + gt * 2);
          }
          if (animState.camera && Math.random() < 0.3) {
            animState.camera.shake(2 + gt * 3, 0.06);
          }
          if (gt >= 1 && bossAi) bossAi._trembleX = 0;
        }

        // ── boss_transform: sprite scales 1x→2x then swaps to mutated ──
        if (this._anim.type === 'boss_transform') {
          if (bossAi) {
            // Smooth eased growth: slow start, fast middle, settle at end
            const eased = gt < 0.5 ? 2 * gt * gt : 1 - Math.pow(-2 * gt + 2, 2) / 2;
            bossAi._mutateProgress = eased;
            bossAi._trembleX = Math.sin(gt * Math.PI * 20) * (1 - gt) * 2;
            if (gt >= 1) {
              bossAi._rageMode = true;
              bossAi._mutateProgress = null;
              bossAi._trembleX = 0;
              bossAi._scale = 2;
            }
          }
          // Scale collider
          if (bossCol) {
            if (!bossCol._baseW) { bossCol._baseW = bossCol.w; bossCol._baseH = bossCol.h; }
            const s = 1 + (bossAi?._mutateProgress || 0);
            bossCol.w = Math.round(bossCol._baseW * s);
            bossCol.h = Math.round(bossCol._baseH * s);
          }
          // Red particles fly off during growth
          if (bossPos && animState.particles && Math.random() < 0.3 + gt * 0.5) {
            animState.particles.emit({
              x: bossPos.x + (Math.random() - 0.5) * 20,
              y: bossPos.y + (Math.random() - 0.5) * 20,
              count: 2, speedMin: 40, speedMax: 120,
              colors: ['#f00', '#c00', '#ff4', '#fff'],
              life: 0.4, sizeMin: 1, sizeMax: 3, gravity: -30,
            });
          }
          // Camera shake escalates
          if (animState.camera && Math.random() < 0.2 + gt * 0.4) {
            animState.camera.shake(2 + gt * 6, 0.08);
          }
          // Final shockwave blast at 85%
          if (gt > 0.85 && !this._anim._blasted) {
            this._anim._blasted = true;
            if (animState.camera) animState.camera.shake(10, 0.4);
            if (bossPos && animState.lighting) {
              animState.lighting.flash(bossPos.x, bossPos.y, 80, 'rgba(255, 80, 40, 0.9)', 0.3);
            }
          }
        }
      }

      if (this._anim.timer >= this._anim.duration) {
        this._anim = null;
        this.nextStep();
      }
      return true;
    }

    // Fade processing
    if (this._fadeTarget !== this._fadeAlpha) {
      const dir = this._fadeTarget > this._fadeAlpha ? 1 : -1;
      this._fadeAlpha += dir * this._fadeSpeed * dt;
      if ((dir > 0 && this._fadeAlpha >= this._fadeTarget) ||
          (dir < 0 && this._fadeAlpha <= this._fadeTarget)) {
        this._fadeAlpha = this._fadeTarget;
        // Fade complete, advance if this was a fade step
        const step = this.steps[this.currentStep];
        if (step && step.type === 'fade') {
          this.nextStep();
        }
      }
    }

    // Dialogue update
    if (this.dialogue) {
      const fastForward = input && input.isHeld('attack');
      this.dialogue.update(dt, fastForward);
    }

    // Waiting for input (dialogue)
    if (this._waitingForInput) {
      if (this.dialogue && this.dialogue.isComplete()) {
        if (input && input.pressed('attack')) {
          this.nextStep();
        }
      } else if (input && input.pressed('attack') && this.dialogue) {
        // Skip to end of text
        this.dialogue.skipToEnd();
      }
      return true;
    }

    // Timer-based steps
    if (this.stepTimer > 0) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.nextStep();
      }
      return true;
    }

    return true;
  }

  render(ctx, vw) {
    if (!this.active && this._fadeAlpha <= 0 && this._barHeight <= 0) return;
    const w = vw || 480;

    // Fade overlay
    if (this._fadeAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${this._fadeAlpha})`;
      ctx.fillRect(0, 0, w, 270);
    }

    // Letterbox bars
    if (this._barHeight > 0.5) {
      ctx.fillStyle = '#000';
      const h = Math.round(this._barHeight);
      ctx.fillRect(0, 0, w, h);
      ctx.fillRect(0, 270 - h, w, h);
    }

    // Dialogue box
    if (this.dialogue && this.dialogue.visible) {
      this.dialogue.render(ctx, w);
    }
  }
}
