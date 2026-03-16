import { Component, Input, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
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

  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['showAlert'] && this.showAlert) {
      this.clearAutoClose();
      this.autoCloseTimer = setTimeout(() => {
        this.showAlert = false;
        this.autoCloseTimer = null;
      }, 3000);
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
    }
  }

  onClose(): void {
    this.clearAutoClose();
    this.showAlert = false;
  }
}
