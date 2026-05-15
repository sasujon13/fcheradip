import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.css']
})
export class AlertComponent implements OnChanges, OnDestroy {
  @Input() message: string = '';
  @Input() showAlert: boolean = false;
  /** 'success' = teal text, 'error' (default) = darkred text */
  @Input() alertType: 'success' | 'error' = 'error';
  /** Emitted when user closes the alert (Close button or overlay click). Parent can set showAlert = false. */
  @Output() alertClosed = new EventEmitter<void>();

  /** Separate from @Input so closing does not rely on mutating the parent's binding. */
  displayed = false;

  /** Minimum time before auto-dismiss (project-wide); hover over dialog pauses countdown. */
  private readonly MIN_AUTO_CLOSE_MS = 7000;
  private readonly TICK_MS = 200;

  private hoverInsideDialog = false;
  private remainingMs = 0;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['showAlert']) {
      if (this.showAlert) {
        this.openAlert();
      } else if (!this.showAlert && changes['showAlert'].previousValue === true) {
        this.dismissWithoutEmit();
      }
    }
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  /** Previous defaults were 700ms (success) and 3000ms (error); enforce at least MIN_AUTO_CLOSE_MS. */
  private baseDurationMs(): number {
    const legacy = this.alertType === 'success' ? 700 : 3000;
    return Math.max(this.MIN_AUTO_CLOSE_MS, legacy);
  }

  private openAlert(): void {
    this.stopCountdown();
    this.displayed = true;
    this.hoverInsideDialog = false;
    this.remainingMs = this.baseDurationMs();
    this.countdownInterval = setInterval(() => {
      if (!this.hoverInsideDialog) {
        this.remainingMs -= this.TICK_MS;
        if (this.remainingMs <= 0) {
          this.autoClose();
        }
      }
    }, this.TICK_MS);
  }

  private stopCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /** Parent set showAlert = false externally */
  private dismissWithoutEmit(): void {
    this.stopCountdown();
    this.displayed = false;
  }

  private autoClose(): void {
    this.stopCountdown();
    this.displayed = false;
    this.alertClosed.emit();
  }

  onDialogEnter(): void {
    this.hoverInsideDialog = true;
  }

  onDialogLeave(): void {
    this.hoverInsideDialog = false;
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('custom-alert-overlay')) {
      this.stopCountdown();
      this.displayed = false;
      this.alertClosed.emit();
    }
  }

  onClose(): void {
    this.stopCountdown();
    this.displayed = false;
    this.alertClosed.emit();
  }
}
