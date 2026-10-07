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
  audience: 'student' | 'teacher';
  listPrice: number;
  price: number;
  discountPercent: number;
  payableAmount: number;
  questionLimit: number;
}

@Component({
  selector: 'app-packages', templateUrl: './packages.component.html',
  styleUrls: ['./packages.component.css'], standalone: false
})
export class PackagesComponent implements OnInit {
  accountType = localStorage.getItem('acctype') || 'Student';
  studentPlanRows: Array<{ name: string; durationMonths: number; audience: 'student'; plans: Record<string, PackagePlan> }> = [];
  teacherPlanRows: Array<{ name: string; durationMonths: number; audience: 'teacher'; plans: Record<string, PackagePlan> }> = [];
  loading = true;
  actionCode = '';
  activeSubscription: any = null;
  activeSubscriptions: any[] = [];
  progress: any = null;
  studentProgress: any = null;
  teacherProgress: any = null;
  pendingPlan: PackagePlan | null = null;
  sharePanelOpen = false;
  referralLink = '';
  referralReference = '';

  get canUseTeacherPackages(): boolean {
    return ['Student', 'Teacher', 'JobSeeker'].includes(this.accountType);
  }

  isCurrentRow(row: { name: string; durationMonths: number; audience: string }): boolean {
    return this.activeSubscriptions.some((subscription) =>
      subscription.planName === row.name && subscription.audience === row.audience
    );
  }
  isTrackActive(row: any, track: string): boolean {
    return this.activeSubscriptions.some((subscription) =>
      subscription.planName === row.name &&
      subscription.audience === row.audience &&
      (subscription.track === track || subscription.track === 'combined')
    );
  }
  isTrackDisabled(row: any, track: string): boolean {
    return track !== 'combined' && this.activeSubscriptions.some((subscription) =>
      subscription.planName === row.name && subscription.track === 'combined'
      && subscription.audience === row.audience
    );
  }
  isMembershipRow(kind: 'question' | 'exam', base: string, badge: string): boolean {
    const progress = kind === 'exam' ? this.studentProgress : this.teacherProgress;
    return !!progress && progress.base === base && progress.badge === badge;
  }

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
    const activePlan = this.activeSubscriptions.find((subscription) => subscription.planCode === plan.code);
    if (activePlan && !activePlan.quotaExhausted) {
      const ends = activePlan?.endsAt ? new Date(activePlan.endsAt).toLocaleDateString() : 'the renewal date';
      this.snackBar.open(`Already activated. Renewal will be charged after the current activation period ends on ${ends}.`, 'Close', { duration: 9000, panelClass: ['package-center-snackbar'] });
      return;
    }
    if (!this.api.isLoggedIn()) {
      const ref = this.snackBar.open('Please log in to activate this package.', 'Login', {
        duration: 8000, panelClass: ['package-center-snackbar', 'error-snackbar']
      });
      ref.onAction().subscribe(() => this.router.navigate(['/login'], { queryParams: { returnUrl: '/packages' } }));
      return;
    }
    this.pendingPlan = plan;
  }

  confirmActivation(): void {
    const plan = this.pendingPlan;
    this.pendingPlan = null;
    if (plan) this.activate(plan);
  }

  cancelActivation(): void { this.pendingPlan = null; }

  private activate(plan: PackagePlan): void {
    this.actionCode = plan.code;
    this.api.subscribePackage(plan.code).subscribe({
      next: (response) => {
        if (typeof response.remainingBalance === 'number') {
          this.trxUnlock.setCachedRemaining(response.remainingBalance);
        }
        this.snackBar.open(response.message || 'Package activated successfully.', 'Close', {
          duration: 6000, panelClass: ['package-center-snackbar', 'success-snackbar']
        });
        this.actionCode = '';
        this.loadPackages(false);
      },
      error: (err) => {
        this.actionCode = '';
        if (err?.error?.code === 'insufficient_balance') {
          const needed = this.formatMoney(err.error.required || plan.payableAmount);
          const available = Number(err.error.remaining || 0).toLocaleString('en-BD');
          const warning = this.snackBar.open(
            `Insufficient balance. Need ৳${needed} (${err.error.requiredCoins || 0} coins); wallet has ${available} coins. Please recharge.`,
            'Recharge', { duration: 12000, panelClass: ['package-center-snackbar', 'error-snackbar'] }
          );
          warning.onAction().subscribe(() => this.router.navigate(['/order']));
          return;
        }
        if (err?.status === 401) {
          const login = this.snackBar.open('Please log in to activate this package.', 'Login', {
            duration: 8000, panelClass: ['package-center-snackbar', 'error-snackbar']
          });
          login.onAction().subscribe(() => this.router.navigate(['/login'], { queryParams: { returnUrl: '/packages' } }));
          return;
        }
        this.snackBar.open(err?.error?.error || 'Could not activate this package. Please try again.', 'Close', {
          duration: 7000, panelClass: ['package-center-snackbar', 'error-snackbar']
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
        this.progress = response.progress || null;
        this.studentProgress = response.studentProgress || (this.accountType === 'Student' ? this.progress : null);
        this.teacherProgress = response.teacherProgress || (this.canUseTeacherPackages ? this.progress : null);
        this.activeSubscription = response.activeSubscription || null;
        this.activeSubscriptions = response.activeSubscriptions || (this.activeSubscription ? [this.activeSubscription] : []);
        const grouped = new Map<string, { name: string; durationMonths: number; audience: 'student' | 'teacher'; plans: Record<string, PackagePlan> }>();
        for (const plan of (response.plans || []) as PackagePlan[]) {
          const key = `${plan.audience}|${plan.name}|${plan.durationMonths}`;
          if (!grouped.has(key)) grouped.set(key, { name: plan.name, durationMonths: plan.durationMonths, audience: plan.audience, plans: {} });
          grouped.get(key)!.plans[plan.track] = plan;
        }
        const rows = Array.from(grouped.values());
        this.studentPlanRows = rows.filter(row => row.audience === 'student') as typeof this.studentPlanRows;
        this.teacherPlanRows = rows.filter(row => row.audience === 'teacher') as typeof this.teacherPlanRows;
        if (this.api.isLoggedIn()) this.loadReferral();
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

  toggleAddMoney(event: Event): void {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('cheradip-toggle-trx-help'));
  }

  toggleSharePanel(event: Event): void {
    event.preventDefault();
    if (!this.api.isLoggedIn()) {
      const ref = this.snackBar.open('Please log in to use Refer & Earn.', 'Login', {
        duration: 8000, panelClass: ['package-center-snackbar', 'error-snackbar']
      });
      ref.onAction().subscribe(() => this.router.navigate(['/login'], { queryParams: { returnUrl: '/packages' } }));
      return;
    }
    this.sharePanelOpen = !this.sharePanelOpen;
    if (!this.referralLink) this.loadReferral();
  }

  closeSharePanel(): void { this.sharePanelOpen = false; }

  shareUrl(service: 'facebook' | 'messenger' | 'whatsapp' | 'telegram' | 'linkedin' | 'x' | 'email'): string {
    const url = encodeURIComponent(this.referralLink);
    const message = encodeURIComponent(this.shareMessage());
    const subject = encodeURIComponent('Join me on Cheradip');
    const urls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${message}`,
      messenger: `fb-messenger://share/?link=${url}`,
      whatsapp: `https://wa.me/?text=${message}`,
      telegram: `https://t.me/share/url?url=${url}&text=${message}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      x: `https://twitter.com/intent/tweet?text=${message}`,
      email: `mailto:?subject=${subject}&body=${message}`,
    };
    return urls[service];
  }

  async copyReferralLink(): Promise<void> {
    if (!this.referralLink) return;
    await navigator.clipboard.writeText(this.referralLink);
    this.snackBar.open('Reference link copied.', 'Close', {
      duration: 3500, panelClass: ['package-center-snackbar', 'success-snackbar']
    });
  }

  private shareMessage(): string {
    return `Learn, practise and grow with Cheradip. Use my verified reference ${this.referralReference} when you create your account: ${this.referralLink}`;
  }

  private loadReferral(): void {
    if (this.referralLink) return;
    this.api.getReferralSummary().subscribe({
      next: value => {
        this.referralReference = String(value.reference || '');
        this.referralLink = `${window.location.origin}${value.referencePath || ''}`;
      },
      error: () => {
        this.referralLink = '';
        this.referralReference = '';
      },
    });
  }
}
