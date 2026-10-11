import { Component, OnInit, AfterViewInit } from '@angular/core';
import { StudentService } from '../../../service/student.service';
import { LoadingService } from 'src/app/service/loading.service';
import { ApiService } from '../../../service/api.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { TrxUnlockService } from '../../../service/trx-unlock.service';
import { packageQuestionProgress } from '../../../shared/package-question-progress';
import { packageRenewalNote } from '../../../shared/package-renewal-note';

/**
 * Top-level `/dashboard` route — copied from student dashboard for independent edits.
 * Student area still uses {@link DashboardComponent} at `/student/dashboard`.
 */
@Component({
    selector: 'app-home-dashboard',
    templateUrl: './home-dashboard.component.html',
    styleUrls: ['./home-dashboard.component.css'],
    standalone: false
})
export class HomeDashboardComponent implements OnInit, AfterViewInit {
  readonly questionProgress = packageQuestionProgress;
  readonly renewalNote = packageRenewalNote;
  packageStatus: any = null;
  renewingPlanCode = '';
  stats: any = {
    examsCompleted: 0,
    averageScore: 0,
    currentRank: 0,
    loginStreak: 0,
    totalPoints: 0,
    currentLevel: 1,
  };

  constructor(
    private studentService: StudentService,
    private loadingService: LoadingService,
    private api: ApiService,
    private snackBar: MatSnackBar,
    private router: Router,
    private trxUnlock: TrxUnlockService,
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.loadDashboardData();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  loadDashboardData(): void {
    this.studentService.getStudentStats().subscribe((data: any) => {
      this.stats = data;
    });
    this.loadPackageStatus();
  }

  get activatedPackageLabel(): string {
    const rows = Array.isArray(this.packageStatus?.activeSubscriptions) ? this.packageStatus.activeSubscriptions : [];
    if (!rows.length) return 'Free';
    return rows.map((row: any) => `${row.planName || 'Package'} — ${row.track || ''}`).join(' + ');
  }

  get renewableSubscriptions(): any[] {
    const rows = Array.isArray(this.packageStatus?.activeSubscriptions) ? this.packageStatus.activeSubscriptions : [];
    return rows.filter((row: any) => row?.autoRenew === true && ['active', 'grace'].includes(row?.status));
  }

  get baseProgressPercent(): number {
    const completed = Number(this.packageStatus?.completedTasks || 0);
    const remaining = Number(this.packageStatus?.remainingTasks || 0);
    return remaining <= 0 ? 100 : Math.min(100, Math.round(completed * 100 / (completed + remaining)));
  }

  get accountTypeLabel(): string {
    return this.packageStatus?.progress?.accountType || localStorage.getItem('acctype') || 'Cheradip';
  }

  renewPackage(subscription: any): void {
    const planCode = String(subscription?.planCode || '');
    if (!planCode || this.renewingPlanCode) return;
    this.renewingPlanCode = planCode;
    this.api.subscribePackage(planCode).subscribe({
      next: response => {
        this.renewingPlanCode = '';
        if (typeof response?.remainingBalance === 'number') {
          this.trxUnlock.setCachedRemaining(response.remainingBalance);
        }
        this.snackBar.open(response?.message || 'Renewal status updated.', 'Close', {
          duration: 7000,
          panelClass: ['package-center-snackbar', 'success-snackbar'],
        });
        this.loadPackageStatus();
      },
      error: error => {
        this.renewingPlanCode = '';
        if (error?.error?.code === 'insufficient_balance') {
          const notice = this.snackBar.open(
            'Your wallet balance is insufficient for this renewal. Please recharge and try again.',
            'Recharge',
            { duration: 10000, panelClass: ['package-center-snackbar', 'error-snackbar'] },
          );
          notice.onAction().subscribe(() => this.router.navigate(['/order']));
          return;
        }
        this.snackBar.open(error?.error?.error || 'The package could not be renewed.', 'Close', {
          duration: 7000,
          panelClass: ['package-center-snackbar', 'error-snackbar'],
        });
      },
    });
  }

  private loadPackageStatus(): void {
    this.api.getPackageStatus().subscribe({
      next: data => this.packageStatus = data,
      error: () => {},
    });
  }
}
