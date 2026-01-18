import type { Unit } from "../units/unit";

export class AnimationSystem {
  private static readonly DEFAULT_UNIT_ANIMATION_SPEED = 2;
  private static readonly UNIT_ANIMATION_EPSILON = 0.001;
  private animationSpeed = AnimationSystem.DEFAULT_UNIT_ANIMATION_SPEED;
  private animationsEnabled = true;
  
  public setAnimationSpeed(speed: number): void {
    if (!Number.isFinite(speed)) {
      return;
    }
    this.animationSpeed = Math.max(0.1, speed);
  }

  public setAnimationsEnabled(enabled: boolean, units: Unit[]): void {
    this.animationsEnabled = enabled;
    if (!enabled) {
      this.finishAllAnimations(units);
    }
  }

  public hasActiveUnitAnimations(units: Unit[]): boolean {
    if (!this.animationsEnabled) {
      return false;
    }
    return units.some((unit) => !this.isUnitAtTarget(unit));
  }

  public advanceUnitAnimations(units: Unit[], deltaSeconds: number): boolean {
    if (!this.animationsEnabled) {
      return this.finishAllAnimations(units);
    }

    if (deltaSeconds <= 0) {
      return false;
    }

    let didUpdate = false;
    const speed = this.animationSpeed;

    for (const unit of units) {
      if (unit.animationPath.length > 0) {
        let remainingStep = speed * deltaSeconds;

        while (remainingStep > 0 && unit.animationPath.length > 0) {
          const next = unit.animationPath[0];
          if (!next) break;

          const dq = next.q - unit.pos.q;
          const dr = next.r - unit.pos.r;
          const dist = Math.sqrt(dq * dq + dr * dr);

          if (dist <= AnimationSystem.UNIT_ANIMATION_EPSILON) {
            unit.pos = { q: next.q, r: next.r };
            unit.animationPath.shift();
            didUpdate = true;
            continue;
          }

          if (remainingStep >= dist) {
            unit.pos = { q: next.q, r: next.r };
            unit.animationPath.shift();
            remainingStep -= dist;
            didUpdate = true;
            continue;
          }

          unit.pos = {
            q: unit.pos.q + (dq / dist) * remainingStep,
            r: unit.pos.r + (dr / dist) * remainingStep,
          };
          didUpdate = true;
          remainingStep = 0;
        }

        if (unit.animationPath.length === 0 && !this.isUnitAtTarget(unit)) {
          unit.pos = { q: unit.q, r: unit.r };
          didUpdate = true;
        }
        continue;
      }
      const dq = unit.q - unit.pos.q;
      const dr = unit.r - unit.pos.r;
      const dist = Math.sqrt(dq * dq + dr * dr);

      if (dist <= AnimationSystem.UNIT_ANIMATION_EPSILON) {
        if (!this.isUnitAtTarget(unit)) {
          unit.pos = { q: unit.q, r: unit.r };
          didUpdate = true;
        }
        continue;
      }

      const step = speed * deltaSeconds;
      if (step >= dist) {
        unit.pos = { q: unit.q, r: unit.r };
        didUpdate = true;
        continue;
      }

      unit.pos = {
        q: unit.pos.q + (dq / dist) * step,
        r: unit.pos.r + (dr / dist) * step,
      };
      didUpdate = true;
    }

    return didUpdate;
  }

  private finishAllAnimations(units: Unit[]): boolean {
    let didUpdate = false;
    for (const unit of units) {
      if (unit.animationPath.length > 0 || !this.isUnitAtTarget(unit)) {
        unit.pos = { q: unit.q, r: unit.r };
        unit.animationPath = [];
        didUpdate = true;
      }
    }
    return didUpdate;
  }

  private isUnitAtTarget(unit: Unit): boolean {
    return (
      Math.abs(unit.pos.q - unit.q) <= AnimationSystem.UNIT_ANIMATION_EPSILON &&
      Math.abs(unit.pos.r - unit.r) <= AnimationSystem.UNIT_ANIMATION_EPSILON
    );
  }
}

