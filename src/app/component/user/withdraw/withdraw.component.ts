import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../service/api.service';

@Component({
  selector: 'app-withdraw',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MatSnackBarModule],
  templateUrl: './withdraw.component.html',
  styleUrls: ['./withdraw.component.css'],
})
export class WithdrawComponent implements OnInit {
  loading = true;
  submitting = false;
  wallet: any = null;
  methods: Array<{ value: string; label: string }> = [];
  withdrawals: any[] = [];
  private returnUrl = '/';

  readonly form = this.fb.group({
    method: ['bkash', Validators.required],
    accountName: ['', Validators.maxLength(100)],
    accountNumber: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(64)]],
    amountTaka: [null as number | null, [Validators.required, Validators.min(100)]],
  });

  constructor(
    private fb: FormBuilder,
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    const candidate = String(this.route.snapshot.queryParamMap.get('returnUrl') || '').trim();
    this.returnUrl = candidate.startsWith('/') && !candidate.startsWith('/withdraw') ? candidate : '/';
    this.loadWallet();
  }

  get bankMethod(): boolean {
    return ['dbbl', 'sonali'].includes(String(this.form.value.method || ''));
  }

  loadWallet(): void {
    this.loading = true;
    this.api.getRewardsWallet().subscribe({
      next: value => {
        this.wallet = value?.wallet || null;
        this.methods = value?.methods || [];
        this.withdrawals = value?.withdrawals || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.notify('Rewards wallet could not be loaded.', true);
      },
    });
  }

  useMaximum(): void {
    this.form.patchValue({ amountTaka: Number(this.wallet?.availableTaka || 0) });
  }

  submit(): void {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.bankMethod && !String(this.form.value.accountName || '').trim()) {
      this.form.get('accountName')?.setErrors({ required: true });
      return;
    }
    this.submitting = true;
    this.api.requestWithdrawal({
      method: String(this.form.value.method || ''),
      accountName: String(this.form.value.accountName || '').trim(),
      accountNumber: String(this.form.value.accountNumber || '').trim(),
      amountTaka: Number(this.form.value.amountTaka),
    }).subscribe({
      next: value => {
        this.submitting = false;
        this.wallet = value?.wallet || this.wallet;
        this.notify(value?.message || 'Withdrawal request submitted.');
        setTimeout(() => void this.router.navigateByUrl(this.returnUrl), 700);
      },
      error: error => {
        this.submitting = false;
        this.notify(error?.error?.error || 'Withdrawal request could not be submitted.', true);
      },
    });
  }

  cancelWithdrawal(row: any): void {
    if (!row?.id || row?.status !== 'pending') return;
    this.api.cancelWithdrawal(Number(row.id)).subscribe({
      next: value => {
        this.wallet = value?.wallet || this.wallet;
        row.status = 'cancelled';
        row.statusLabel = 'Cancelled by user';
        this.notify(value?.message || 'Withdrawal request cancelled.');
      },
      error: error => this.notify(error?.error?.error || 'Request could not be cancelled.', true),
    });
  }

  goBack(): void {
    void this.router.navigateByUrl(this.returnUrl);
  }

  private notify(message: string, error = false): void {
    this.snackBar.open(message, 'Close', {
      duration: error ? 7000 : 5000,
      panelClass: ['package-center-snackbar', error ? 'error-snackbar' : 'success-snackbar'],
    });
  }
}
