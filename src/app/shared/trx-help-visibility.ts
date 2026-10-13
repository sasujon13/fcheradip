export type TrxHelpPhase = 'off' | 'on' | 'closing';

/** Keep payment help open while hovered; dismiss after 15 seconds outside it. */
export class TrxHelpVisibility {
  phase: TrxHelpPhase = 'off';
  private pointerOnBox = false;
  private idleTimer?: number;
  private fadeTimer?: number;

  constructor(private changed: () => void) {}

  show(): void {
    if (this.phase === 'on') return;
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
    this.clearTimers();
    this.setPhase('on');
  }

  leaveBox(): void {
    this.pointerOnBox = false;
    this.scheduleClose();
  }

  documentClick(target: EventTarget | null, container?: HTMLElement): void {
    if (this.phase === 'off') return;
    const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    if (element?.closest('[data-trx-help-trigger]')) return;
    if (target instanceof Node && container?.contains(target)) return;
    this.hide();
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
