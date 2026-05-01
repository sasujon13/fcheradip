import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';

/**
 * Shared header section for NTRCA pages: token box + main message + notice links (৮ম, ৭ম, ৬ষ্ঠ, ৫ম).
 * Used by: ntrca, vacant5/6/7/8, merit5/6/7/8, recommend5/6/7/8.
 */
@Component({
  selector: 'app-ntrca-header-section',
  templateUrl: './ntrca-header-section.component.html',
  styleUrls: ['./ntrca-header-section.component.css']
})
export class NtrcaHeaderSectionComponent implements OnDestroy {
  @Input() newToken = '';
  @Output() newTokenChange = new EventEmitter<string>();
  @Input() remainingUnlocks = 0;
  @Output() applyTokenClick = new EventEmitter<void>();

  trxHelpPhase: 'off' | 'on' | 'closing' = 'off';
  private trxHelpTimers: number[] = [];

  ngOnDestroy(): void {
    this.clearTrxHelpTimers();
  }

  onTrxHelpPointerEnter(): void {
    this.clearTrxHelpTimers();
    this.trxHelpPhase = 'on';
  }

  onTrxHelpPointerLeave(): void {
    this.clearTrxHelpTimers();
    const delayedClose = window.setTimeout(() => {
      this.trxHelpPhase = 'closing';
      const detach = window.setTimeout(() => {
        this.trxHelpPhase = 'off';
      }, 300);
      this.trxHelpTimers.push(detach);
    }, 1000);
    this.trxHelpTimers.push(delayedClose);
  }

  private clearTrxHelpTimers(): void {
    this.trxHelpTimers.forEach(clearTimeout);
    this.trxHelpTimers.length = 0;
  }
}
