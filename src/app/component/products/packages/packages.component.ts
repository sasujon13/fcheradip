import { Component, OnInit, Renderer2 } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from 'src/app/service/api.service';
import { LoadingService } from 'src/app/service/loading.service';
import { TrxUnlockService } from 'src/app/service/trx-unlock.service';

/** One selectable price in the original package matrix. */
interface PackagePlan {
  code: string;
  name: string;
  durationMonths: number;
  track: 'academic' | 'admission' | 'combined';
  listPrice: number;
  price: number;
  discountPercent: number;
  payableAmount: number;
}

@Component({
  selector: 'app-packages', templateUrl: './packages.component.html',
  styleUrls: ['./packages.component.css'], standalone: false
})
export class PackagesComponent implements OnInit {
  accountType = localStorage.getItem('acctype') || 'Student';
  planRows: Array<{ name: string; durationMonths: number; plans: Record<string, PackagePlan> }> = [];
  loading = true;
  actionCode = '';

  constructor(private api: ApiService, private router: Router, private renderer: Renderer2,
              private loadingService: LoadingService, private snackBar: MatSnackBar,
              private trxUnlock: TrxUnlockService) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    const searchBar = document.getElementById('searchBar');
    if (searchBar) searchBar.style.display = 'block';
    this.loadPackages();
  }

  ngAfterViewInit(): void {
    const signMenu = document.getElementById('sign_menu');
    if (signMenu) this.renderer.setStyle(signMenu, 'display', 'flex');
  }

  selectPlan(event: Event, plan: PackagePlan): void {
    event.preventDefault();
    if (!this.api.isLoggedIn()) {
      const ref = this.snackBar.open('Please log in to activate this package.', 'Login', {
        duration: 8000, panelClass: ['error-snackbar']
      });
      ref.onAction().subscribe(() => this.router.navigate(['/login'], { queryParams: { returnUrl: '/packages' } }));
      return;
    }
    const track = plan.track.charAt(0).toUpperCase() + plan.track.slice(1);
    const ref = this.snackBar.open(
      `Activate ${plan.name} ${track} for ৳${this.formatMoney(plan.payableAmount)}?`,
      'Activate', { duration: 10000 }
    );
    ref.onAction().subscribe(() => this.activate(plan));
  }

  private activate(plan: PackagePlan): void {
    this.actionCode = plan.code;
    this.api.subscribePackage(plan.code).subscribe({
      next: (response) => {
        if (typeof response.remainingBalance === 'number') {
          this.trxUnlock.setCachedRemaining(response.remainingBalance);
        }
        this.snackBar.open(response.message || 'Package activated successfully.', 'Close', {
          duration: 6000, panelClass: ['success-snackbar']
        });
        this.actionCode = '';
        this.loadPackages(false);
      },
      error: (err) => {
        this.actionCode = '';
        if (err?.error?.code === 'insufficient_balance') {
          const needed = this.formatMoney(err.error.required || plan.payableAmount);
          const available = this.formatMoney(err.error.remaining || 0);
          const warning = this.snackBar.open(
            `Insufficient balance. Need ৳${needed}; wallet has ৳${available}. Please recharge.`,
            'Recharge', { duration: 12000, panelClass: ['error-snackbar'] }
          );
          warning.onAction().subscribe(() => this.router.navigate(['/order']));
          return;
        }
        if (err?.status === 401 || err?.status === 403) {
          const login = this.snackBar.open('Please log in to activate this package.', 'Login', {
            duration: 8000, panelClass: ['error-snackbar']
          });
          login.onAction().subscribe(() => this.router.navigate(['/login'], { queryParams: { returnUrl: '/packages' } }));
          return;
        }
        this.snackBar.open(err?.error?.error || 'Could not activate this package. Please try again.', 'Close', {
          duration: 7000, panelClass: ['error-snackbar']
        });
      }
    });
  }

  formatMoney(value: number): string {
    return Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 });
  }

  private loadPackages(showLoader = true): void {
    if (showLoader) this.loading = true;
    this.api.getPackages(this.accountType).subscribe({
      next: (response) => {
        if (response.progress?.accountType) this.accountType = response.progress.accountType;
        const grouped = new Map<string, { name: string; durationMonths: number; plans: Record<string, PackagePlan> }>();
        for (const plan of (response.plans || []) as PackagePlan[]) {
          const key = `${plan.name}|${plan.durationMonths}`;
          if (!grouped.has(key)) grouped.set(key, { name: plan.name, durationMonths: plan.durationMonths, plans: {} });
          grouped.get(key)!.plans[plan.track] = plan;
        }
        this.planRows = Array.from(grouped.values());
        this.loading = false;
        this.loadingService.completeOne();
      },
      error: () => {
        this.snackBar.open('Packages could not be loaded.', 'Close', {
          duration: 7000, panelClass: ['error-snackbar']
        });
        this.loading = false;
        this.loadingService.completeOne();
      }
    });
  }
}
