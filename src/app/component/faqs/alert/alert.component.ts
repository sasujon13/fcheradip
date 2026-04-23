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

  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['showAlert'] && this.showAlert) {
      this.clearAutoClose();
      const delayMs = this.alertType === 'success' ? 700 : 3000;
      this.autoCloseTimer = setTimeout(() => {
        this.showAlert = false;
        this.autoCloseTimer = null;
        this.alertClosed.emit();
      }, delayMs);
    }
  }

  ngOnDestroy(): void {
    this.clearAutoClose();
  }

  private clearAutoClose(): void {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('custom-alert-overlay')) {
      this.clearAutoClose();
      this.showAlert = false;
      this.alertClosed.emit();
    }
  }

  onClose(): void {
    this.clearAutoClose();
    this.showAlert = false;
    this.alertClosed.emit();
  }
}
