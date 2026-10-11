export type TrxHelpPhase = 'off' | 'on' | 'closing';

/** Idle dismissal for both shared payment-help headers, including click-to-open. */
export class TrxHelpVisibility {
  phase: TrxHelpPhase = 'off';
  private pointerOnBox = false;
  private idleTimer?: number;
  private fadeTimer?: number;

  constructor(private changed: () => void) {}

  show(): void {
    this.clearTimers();
    this.setPhase('on');
    this.scheduleClose();
  }

  toggle(): void {
    if (this.phase === 'on') this.hide();
    else this.show();
  }

  enterBox(): void {
    this.pointerOnBox = true;
    this.show();
  }

  leaveBox(): void {
    this.pointerOnBox = false;
    this.scheduleClose();
  }

  interact(): void {
    if (this.phase !== 'off') this.show();
  }

  leaveTrigger(): void {
    this.scheduleClose();
  }

  hide(): void {
    this.clearTimers();
    this.pointerOnBox = false;
    this.setPhase('off');
  }

  destroy(): void {
    this.clearTimers();
  }

  private scheduleClose(): void {
    this.clearTimers();
    if (this.phase === 'off' || this.pointerOnBox) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = undefined;
      if (this.pointerOnBox) return;
      this.setPhase('closing');
      this.fadeTimer = window.setTimeout(() => {
        this.fadeTimer = undefined;
        this.setPhase('off');
      }, 300);
    }, 15000);
  }

  private clearTimers(): void {
    if (this.idleTimer != null) window.clearTimeout(this.idleTimer);
    if (this.fadeTimer != null) window.clearTimeout(this.fadeTimer);
    this.idleTimer = this.fadeTimer = undefined;
  }

  private setPhase(phase: TrxHelpPhase): void {
    this.phase = phase;
    this.changed();
  }
}
