import { Component, OnInit, AfterViewInit, OnDestroy, Renderer2 } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/service/api.service';
import { CountryService, Country } from 'src/app/service/country.service';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { LoadingService } from 'src/app/service/loading.service';
import { WelcomeBonusCeremonyService } from 'src/app/service/welcome-bonus-ceremony.service';


@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {
  authForm: FormGroup;
  isMobileNumberRegistered = false;
  isPasswordMismatch = false;
  isPasswordLength = false;
  showPassword: boolean = false;

  // Country (from cheradip_country via API) – phone length comes from selected country
  selectedCountry: Country | null = null;
  phonePlaceholder = 'Your Mobile Number';
  /** Min length for mobile (from selected country). */
  phoneMinLength = 10;
  /** Max length for mobile (from selected country). */
  phoneMaxLength = 15;

  /** When mobile exists, which table it was found in (student|jobseeker|teacher|customer). Sent with login. */
  loginFoundIn: string | null = null;

  private destroy$ = new Subject<void>();

  // Forgot Password Modal
  showForgotPasswordModal = false;
  forgotPasswordStep = 1;
  forgotPasswordMobile = '';
  forgotPasswordEmail = '';
  verificationCode = '';
  newPassword = '';
  confirmPassword = '';
  hasEmail = false;
  isSendingCode = false;
  isVerifying = false;
  isResetting = false;
  forgotPasswordError = '';
  forgotPasswordSuccess = '';

  /** Auth alert (same style as NTRCA snackbar: success = teal, error = darkred) */
  authAlertMessage = '';
  showAuthAlert = false;
  authAlertIsSuccess = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private http: HttpClient,
    private renderer: Renderer2,
    private countryService: CountryService,
    private cdr: ChangeDetectorRef,
    private loadingService: LoadingService,
    private welcomeCeremony: WelcomeBonusCeremonyService
  ) {
    this.authForm = this.fb.group({
      countryCode: ['BD', [Validators.required]],
      username: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(15)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(14)]],
    });
  }

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'none';
    }

    const formData = localStorage.getItem('formData');
    if (formData) {
      try {
        const authData = JSON.parse(formData);
        if (authData.countryCode) {
          this.authForm.patchValue({ countryCode: authData.countryCode });
          this.countryService.getCountry(authData.countryCode).subscribe({
            next: (c) => this.onCountryChange(c),
            error: () => {}
          });
        }
        if (authData.username) this.authForm.patchValue({ username: authData.username });
      } catch (_) {}
    }

    // Sync country from service – phone length is always from selected country (input allows 11 for BD)
    this.countryService.country$.pipe(takeUntil(this.destroy$)).subscribe(country => {
      if (country && !this.authForm.get('countryCode')?.value) {
        this.selectedCountry = country;
        this.authForm.patchValue({ countryCode: country.country_code }, { emitEvent: false });
        this.phoneMinLength = this.countryService.getPhoneMinLength(country);
        this.phoneMaxLength = this.countryService.getPhoneInputMaxLength(country);
        this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
        this.updatePhoneValidators();
      } else if (country) {
        this.selectedCountry = country;
        this.phoneMinLength = this.countryService.getPhoneMinLength(country);
        this.phoneMaxLength = this.countryService.getPhoneInputMaxLength(country);
        this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
        this.updatePhoneValidators();
      }
    });
    // If we already have countryCode, load country
    const code = this.authForm.get('countryCode')?.value;
    if (code) {
      this.countryService.getCountry(code).subscribe({
        next: (c) => this.onCountryChange(c),
        error: () => {}
      });
    }

    // Bangladesh: strip leading 0 and cap at 10 digits in the field (so field always shows 10 digits max)
    this.authForm.get('username')?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe((value) => {
      const countryCode = this.authForm.get('countryCode')?.value || this.selectedCountry?.country_code;
      if (!this.countryService.isBangladesh(countryCode)) return;
      const raw = (value || '').toString();
      const normalized = this.countryService.normalizeMobileInputForDisplay(countryCode, raw);
      const currentDigits = raw.replace(/\D/g, '');
      if (normalized !== currentDigits) {
        this.authForm.get('username')?.setValue(normalized, { emitEvent: false });
      }
    });

    this.authForm.get('username')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((username) => {
          const u = (username || '').toString();
          if (!this.selectedCountry) {
            this.loginFoundIn = null;
            return of(null);
          }
          const code = this.authForm.get('countryCode')?.value;
          const countryCode = typeof code === 'string' ? code : (code?.country_code ?? code?.countryCode ?? '');
          const normalizedU = this.countryService.normalizeMobileNumber(countryCode, u);
          const isComplete = normalizedU.length >= this.phoneMinLength && normalizedU.length <= this.phoneMaxLength;
          if (!isComplete) {
            this.loginFoundIn = null;
            return of(null);
          }
          return this.apiService.checkMobileNumberExists(normalizedU, countryCode || undefined);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response: any) => {
        if (response == null) {
          this.isMobileNumberRegistered = false;
          this.loginFoundIn = null;
          return;
        }
        if (typeof response === 'object' && response.hasOwnProperty('exists')) {
          this.loginFoundIn = response.found_in ?? null;
          this.isMobileNumberRegistered = response.exists === false;
        }
      });

    // Clear password error when user edits password after a failed login
    this.authForm.get('password')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => { this.isPasswordMismatch = false; });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onCountryChange(country: Country): void {
    this.selectedCountry = country;
    // Do not call countryService.setCountry() — login country is form-only; header language/flag stays unchanged
    this.authForm.patchValue({ countryCode: country.country_code }, { emitEvent: false });
    this.phoneMinLength = this.countryService.getPhoneMinLength(country);
    this.phoneMaxLength = this.countryService.getPhoneInputMaxLength(country);
    this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
    this.updatePhoneValidators();
    this.applyBangladeshPhoneDisplay(country.country_code);
  }

  private updatePhoneValidators(): void {
    const ctrl = this.authForm.get('username');
    if (ctrl) {
      ctrl.setValidators([
        Validators.required,
        Validators.minLength(this.phoneMinLength),
        Validators.maxLength(this.phoneMaxLength)
      ]);
      ctrl.updateValueAndValidity();
    }
  }

  /** When country is BD, normalize username field: strip leading 0 and cap at 10 digits. */
  private applyBangladeshPhoneDisplay(countryCode: string): void {
    if (!this.countryService.isBangladesh(countryCode)) return;
    const ctrl = this.authForm.get('username');
    const raw = (ctrl?.value || '').toString();
    const normalized = this.countryService.normalizeMobileInputForDisplay(countryCode, raw);
    if (normalized !== raw.replace(/\D/g, '')) {
      ctrl?.setValue(normalized, { emitEvent: false });
    }
  }

    ngAfterViewInit(): void {
      const signMenu = document.getElementById('sign_menu');
      if (signMenu) {
        this.renderer.setStyle(signMenu, 'display', 'flex');
      }
      setTimeout(() => this.loadingService.completeOne(), 0);
    }

  onAuth() {
    if (this.authForm.valid) {
      const raw = this.authForm.get('countryCode')?.value;
      const countryCode = typeof raw === 'string' ? raw : (raw?.country_code ?? raw?.countryCode ?? '');
      const username = this.countryService.normalizeMobileNumber(countryCode, this.authForm.value.username || '');
      const password = this.authForm.value.password;
      const formData = { ...this.authForm.value, username };
      localStorage.setItem('formData', JSON.stringify(formData));
      this.apiService.login(username, password, countryCode || undefined, this.loginFoundIn ?? undefined).subscribe({
        next: (response: { authToken?: string; showWelcomeCoinsCeremony?: boolean }) => {
          this.showAuthAlertMessage('LoggedIn successfully!', true);
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('username', username);
          if (response && response.authToken) localStorage.setItem('authToken', response.authToken);
          localStorage.setItem('formData', JSON.stringify(formData));
          if (response?.showWelcomeCoinsCeremony) {
            this.welcomeCeremony.schedule();
          }
          this.logout();
          const returnUrl = localStorage.getItem('returnUrl') || '/';
          setTimeout(() => {
            this.router.navigateByUrl(returnUrl).then(() => {
              localStorage.setItem('returnUrl', '');
              const scrollY = sessionStorage.getItem('signupReturnScrollY');
              if (scrollY != null) {
                sessionStorage.removeItem('signupReturnScrollY');
                requestAnimationFrame(() => window.scrollTo(0, parseInt(scrollY, 10)));
              }
            });
          }, 700);
        },
        error: () => {
          this.isPasswordMismatch = true;
        }
      });
    } else {
      this.authForm.markAllAsTouched();
      this.isPasswordMismatch = true;
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  /** Show auth alert (same snackbar as NTRCA: success = teal, error = darkred). Reset first so it re-shows on every submit. */
  private showAuthAlertMessage(msg: string, isSuccess: boolean): void {
    this.showAuthAlert = false;
    this.authAlertMessage = msg;
    this.authAlertIsSuccess = isSuccess;
    this.cdr.detectChanges();
    this.showAuthAlert = true;
    this.cdr.detectChanges();
  }

  logout(): void {
    const menu_item0 = document.getElementById('menu_item0');
    const menu_item1 = document.getElementById('menu_item1');
    const menu_item2 = document.getElementById('menu_item2');
    const profileMenu = document.getElementById('profileMenu');
    const sign_menu = document.getElementById('sign_menu');
    if (menu_item2 && menu_item1 && menu_item0 && profileMenu && sign_menu) {
        menu_item2.style.display = 'block';
        menu_item1.style.display = 'none';
        menu_item0.style.display = 'none';
        sign_menu.style.display = 'none';
        profileMenu.style.display = 'block';
        document.querySelector('header')?.classList.add('logged-in');
      }
  }

  // =========================================================================
  // FORGOT PASSWORD METHODS
  // =========================================================================

  openForgotPassword(): void {
    this.showForgotPasswordModal = true;
    this.forgotPasswordStep = 1;
    this.forgotPasswordMobile = this.authForm.get('username')?.value || '';
    this.forgotPasswordEmail = '';
    this.verificationCode = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.forgotPasswordError = '';
    this.forgotPasswordSuccess = '';
  }

  closeForgotPasswordModal(): void {
    this.showForgotPasswordModal = false;
    this.forgotPasswordStep = 1;
    this.forgotPasswordError = '';
    this.forgotPasswordSuccess = '';
  }

  sendResetCode(): void {
    this.forgotPasswordError = '';
    this.forgotPasswordSuccess = '';

    const countryCode = this.authForm.get('countryCode')?.value || this.selectedCountry?.country_code || 'BD';
    const mobileNormalized = this.countryService.normalizeMobileNumber(countryCode, this.forgotPasswordMobile);
    const len = mobileNormalized.replace(/\D/g, '').length;
    const validLength = this.countryService.isBangladesh(countryCode) ? len === 10 : (len >= (this.phoneMinLength || 10) && len <= (this.phoneMaxLength || 15));
    if (!this.forgotPasswordMobile || !validLength) {
      this.forgotPasswordError = this.countryService.isBangladesh(countryCode)
        ? 'Please enter a valid 10 or 11-digit mobile number (e.g. 01712345678)'
        : 'Please enter a valid mobile number';
      return;
    }

    this.isSendingCode = true;

    console.log('Sending reset code:', {
      mobile: mobileNormalized,
      email: this.forgotPasswordEmail
    });

    // Send with email if provided (use normalized mobile: 10 digits for BD)
    this.apiService.sendPasswordResetCode(mobileNormalized, this.forgotPasswordEmail || undefined).subscribe(
      (response: any) => {
        console.log('Reset code response:', response);
        this.isSendingCode = false;
        if (response.success) {
          this.forgotPasswordSuccess = response.message || 'Verification code sent!';
          this.forgotPasswordStep = 2;
        } else if (response.needs_email) {
          this.hasEmail = false;
          this.forgotPasswordError = 'Please provide an email address to receive the code.';
        } else {
          this.forgotPasswordError = response.message || 'Failed to send code. Please try again.';
        }
      },
      (error) => {
        console.error('Reset code error:', error);
        console.error('Error details:', {
          status: error.status,
          statusText: error.statusText,
          error: error.error,
          message: error.message
        });
        this.isSendingCode = false;
        const errorMessage = error.error?.message || error.error?.error || error.message || 'Failed to send code. Please try again.';
        this.forgotPasswordError = errorMessage;
      }
    );
  }

  verifyResetCode(): void {
    this.forgotPasswordError = '';
    this.forgotPasswordSuccess = '';

    if (!this.verificationCode || this.verificationCode.length !== 6) {
      this.forgotPasswordError = 'Please enter a valid 6-digit code';
      return;
    }

    this.isVerifying = true;

    this.apiService.verifyCode(this.forgotPasswordMobile, this.verificationCode).subscribe(
      (response: any) => {
        this.isVerifying = false;
        if (response.success) {
          this.forgotPasswordSuccess = 'Code verified! Set your new password.';
          this.forgotPasswordStep = 3;
        } else {
          this.forgotPasswordError = response.message || 'Invalid or expired code.';
        }
      },
      (error) => {
        this.isVerifying = false;
        this.forgotPasswordError = error.error?.message || 'Invalid or expired code.';
      }
    );
  }

  resetPassword(): void {
    this.forgotPasswordError = '';
    this.forgotPasswordSuccess = '';

    if (!this.newPassword || this.newPassword.length < 6 || this.newPassword.length > 14) {
      this.forgotPasswordError = 'Password must be 6-14 characters';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.forgotPasswordError = 'Passwords do not match';
      return;
    }

    this.isResetting = true;

    this.apiService.resetPasswordWithCode(
      this.forgotPasswordMobile,
      this.verificationCode,
      this.newPassword
    ).subscribe(
      (response: any) => {
        this.isResetting = false;
        if (response.success) {
          this.forgotPasswordSuccess = 'Password reset successful! You can now login.';
          this.showAuthAlertMessage('Password reset successful! You can now login.', true);
          setTimeout(() => {
            this.closeForgotPasswordModal();
          }, 2000);
        } else {
          this.forgotPasswordError = response.message || 'Failed to reset password.';
        }
      },
      (error) => {
        this.isResetting = false;
        this.forgotPasswordError = error.error?.message || 'Failed to reset password.';
      }
    );
  }
}