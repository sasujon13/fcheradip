import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Shared header section for NTRCA pages: token box + main message + notice links (৮ম, ৭ম, ৬ষ্ঠ, ৫ম).
 * Used by: ntrca, vacant5/6/7/8, merit5/6/7/8, recommend5/6/7/8.
 */
@Component({
  selector: 'app-ntrca-header-section',
  templateUrl: './ntrca-header-section.component.html',
  styleUrls: ['./ntrca-header-section.component.css']
})
export class NtrcaHeaderSectionComponent {
  @Input() newToken = '';
  @Output() newTokenChange = new EventEmitter<string>();
  @Input() remainingUnlocks = 0;
  @Output() applyTokenClick = new EventEmitter<void>();
}
