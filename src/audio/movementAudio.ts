import type { Unit } from "../core/units/unit";
import { UnitType } from "../core/units/unitType";

const UNIT_ANIMATION_EPSILON = 0.001;

type MovementAudioKey = "infantry" | "cavalry" | "tank";

type MovementAudioConfig = {
  enabled: boolean;
  volume: number;
};

type MovementAudioState = {
  element: HTMLAudioElement;
  isPlaying: boolean;
};

export class MovementAudioController {
  private enabled: boolean;
  private volume: number;
  private readonly audio: Record<MovementAudioKey, MovementAudioState>;

  constructor(config: MovementAudioConfig) {
    this.enabled = config.enabled;
    this.volume = this.clampVolume(config.volume);
    this.audio = {
      infantry: { element: new Audio("/sounds/infantry.ogg"), isPlaying: false },
      cavalry: { element: new Audio("/sounds/cavalry.ogg"), isPlaying: false },
      tank: { element: new Audio("/sounds/tank.ogg"), isPlaying: false },
    };

    for (const audio of Object.values(this.audio)) {
      audio.element.loop = true;
    }

    this.applyVolume();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }

  public setVolume(volume: number): void {
    this.volume = this.clampVolume(volume);
    this.applyVolume();
  }

  public update(units: Unit[]): void {
    if (!this.enabled) {
      this.stopAll();
      return;
    }

    let hasTankMoving = false;
    let hasCavalryMoving = false;
    let hasInfantryMoving = false;

    for (const unit of units) {
      if (!this.isUnitMoving(unit)) {
        continue;
      }

      if (unit.type === UnitType.Tank) {
        hasTankMoving = true;
        continue;
      }

      if (unit.type === UnitType.Cavalry) {
        hasCavalryMoving = true;
        continue;
      }

      hasInfantryMoving = true;
    }

    this.playMovementSound("tank", hasTankMoving);
    this.playMovementSound("cavalry", hasCavalryMoving);
    this.playMovementSound("infantry", hasInfantryMoving);
  }

  private isUnitMoving(unit: Unit): boolean {
    const dq = unit.pos.q - unit.q;
    const dr = unit.pos.r - unit.r;
    const dist = Math.sqrt(dq * dq + dr * dr);
    return unit.animationPath.length > 0 || dist > UNIT_ANIMATION_EPSILON;
  }

  private playMovementSound(soundKey: MovementAudioKey, shouldPlay: boolean): void {
    const audio = this.audio[soundKey];
    if (shouldPlay && !audio.isPlaying) {
      audio.isPlaying = true;
      audio.element
        .play()
        .catch(() => {
          audio.isPlaying = false;
        });
      return;
    }

    if (!shouldPlay && audio.isPlaying) {
      audio.element.pause();
      audio.element.currentTime = 0;
      audio.isPlaying = false;
    }
  }

  private stopAll(): void {
    for (const audio of Object.values(this.audio)) {
      if (audio.isPlaying) {
        audio.element.pause();
        audio.element.currentTime = 0;
        audio.isPlaying = false;
      }
    }
  }

  private applyVolume(): void {
    for (const audio of Object.values(this.audio)) {
      audio.element.volume = this.volume;
    }
  }

  private clampVolume(volume: number): number {
    if (!Number.isFinite(volume)) {
      return 1;
    }
    return Math.min(1, Math.max(0, volume));
  }
}
