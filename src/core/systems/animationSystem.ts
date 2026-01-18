import type { Unit } from "../units/unit";

export class AnimationSystem {
  private static readonly UNIT_ANIMATION_SPEED = 6;
  private static readonly UNIT_ANIMATION_EPSILON = 0.001;

  public hasActiveUnitAnimations(units: Unit[]): boolean {
    return units.some((unit) => !this.isUnitAtTarget(unit));
  }

  public advanceUnitAnimations(units: Unit[], deltaSeconds: number): boolean {
    if (deltaSeconds <= 0) {
      return false;
    }

    let didUpdate = false;
    const speed = AnimationSystem.UNIT_ANIMATION_SPEED;

    for (const unit of units) {
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

  private isUnitAtTarget(unit: Unit): boolean {
    return (
      Math.abs(unit.pos.q - unit.q) <= AnimationSystem.UNIT_ANIMATION_EPSILON &&
      Math.abs(unit.pos.r - unit.r) <= AnimationSystem.UNIT_ANIMATION_EPSILON
    );
  }
}

