import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Shared footer section for NTRCA pages: token box, container (why-choose + cta), alerts, loading, PDF loaders, gap.
 * Used by: ntrca, vacant5/6/7, merit5/6/7, recommend5/6/7.
 */
@Component({
  selector: 'app-ntrca-footer-section',
  templateUrl: './ntrca-footer-section.component.html',
  styleUrls: ['./ntrca-footer-section.component.css']
})
export class NtrcaFooterSectionComponent {
  /** First alert message (e.g. "Select Subject Code to Search!" on ntrca, else "Select All Critera to Search!") */
  @Input() firstAlertMessage: string = 'Select All Critera to Search!';

  /** Token input (two-way with newTokenChange) */
  @Input() newToken = '';
  @Output() newTokenChange = new EventEmitter<string>();
  /** Remaining unlocks count to display */
  @Input() remainingUnlocks = 0;
  @Output() applyTokenClick = new EventEmitter<void>();

  @Input() showNoDataAlert = false;
  @Input() showNoDataAlert2 = false;
  @Input() showNoDataAlert3 = false;
  @Input() showNoDataAlert4 = false;
  @Input() showNoDataAlert5 = false;
  @Input() showNoDataAlert6 = false;
  @Input() showNoDataAlert7 = false;
  @Input() showNoDataAlert8 = false;
  @Input() showNoDataAlert9 = false;
  @Input() showNoDataAlert10 = false;
  @Input() showNoDataAlert11 = false;

  @Input() loading = false;
  @Input() isGeneratingPdf = false;
  @Input() isGeneratingPdf2 = false;
}
