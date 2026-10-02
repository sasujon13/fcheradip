import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../service/api.service';

@Component({
  selector: 'app-refer-earn',
  standalone: true,
  imports: [CommonModule, MatSnackBarModule],
  templateUrl: './refer-earn.component.html',
  styleUrls: ['./refer-earn.component.css'],
})
export class ReferEarnComponent implements OnInit {
  summary: any = null;
  loading = true;
  referralLink = '';

  constructor(private api: ApiService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.api.getReferralSummary().subscribe({
      next: value => {
        this.summary = value;
        this.referralLink = `${window.location.origin}${value.referencePath}`;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Referral details could not be loaded.', 'Close', { duration: 6000 });
      },
    });
  }

  async copyLink(): Promise<void> {
    await navigator.clipboard.writeText(this.referralLink);
    this.snackBar.open('Reference link copied.', 'Close', { duration: 3500 });
  }
}
