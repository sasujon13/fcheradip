import { Component, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/service/api.service';
import { CountryService, Country } from 'src/app/service/country.service';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';


@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  authForm: FormGroup;
  isMobileNumberRegistered = false;
  isPasswordMismatch = false;
  isPasswordLength = false;
  showPassword: boolean = false;

  // Country (from cheradip_country via API)
  selectedCountry: Country | null = null;
  phonePlaceholder = 'Your Mobile Number';
  phoneMinLength = 10;
  phoneMaxLength = 11;

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

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private snackBar: MatSnackBar,
    private http: HttpClient,
    private renderer: Renderer2,
    private countryService: CountryService
  ) {
    this.authForm = this.fb.group({
      countryCode: ['BD', [Validators.required]],
      username: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(15)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(14)]],
    });
  }

  ngOnInit(): void {
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

    // Sync country from service (saved/detected from cheradip_country)
    this.countryService.country$.pipe(takeUntil(this.destroy$)).subscribe(country => {
      if (country && !this.authForm.get('countryCode')?.value) {
        this.selectedCountry = country;
        this.authForm.patchValue({ countryCode: country.country_code }, { emitEvent: false });
        this.phoneMinLength = country.phone_length_min ?? 10;
        this.phoneMaxLength = country.phone_length_max ?? 11;
        this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
        this.updatePhoneValidators();
      } else if (country) {
        this.selectedCountry = country;
        this.phoneMinLength = country.phone_length_min ?? 10;
        this.phoneMaxLength = country.phone_length_max ?? 11;
        this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
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

    this.authForm.get('username')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((username) => {
          const u = (username || '').toString();
          if (u.length >= this.phoneMinLength) {
            return this.apiService.checkMobileNumberExists(u);
          }
          return of(false);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response: any) => {
        if (!response)
          this.isMobileNumberRegistered = false;
        else if (typeof response === 'object' && response.hasOwnProperty('exists')) {
          const check = response.exists;
          if (check === false)
            this.isMobileNumberRegistered = true;
          else
            this.isMobileNumberRegistered = false;
        }
      });

    this.authForm.get('password')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((password) => {
          const username = this.authForm.get('username')?.value;
          if (password && password.length > 5 && password.length < 15) {
            return this.apiService.checkPasswordExists(username, password);
          }
          return of(false);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response: any) => {
        if (!response) {
          this.isPasswordLength = true;
          this.isPasswordMismatch = false;
        }
        else if (typeof response === 'object' && response.hasOwnProperty('exists')) {
          const check = response.exists;
          this.isPasswordLength = false;
          if (check === false)
            this.isPasswordMismatch = true;
          else
            this.isPasswordMismatch = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onCountryChange(country: Country): void {
    this.selectedCountry = country;
    this.countryService.setCountry(country);
    this.authForm.patchValue({ countryCode: country.country_code }, { emitEvent: false });
    this.phoneMinLength = country.phone_length_min ?? 10;
    this.phoneMaxLength = country.phone_length_max ?? 11;
    this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
    this.updatePhoneValidators();
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

    ngAfterViewInit(): void {
      const signMenu = document.getElementById('sign_menu');
      if (signMenu) {
        this.renderer.setStyle(signMenu, 'display', 'flex');
      }
    }

  onAuth() {
    if (this.authForm.valid) {
      const username = this.authForm.value.username;
      const password = this.authForm.value.password;
      const formData = this.authForm.value;
      localStorage.setItem('formData', JSON.stringify(formData));
      if (this.isPasswordMismatch === false) {
        this.apiService.login(username, password).subscribe(
          (response) => {
            this.snackBar.open('Signin Successful!', 'Close', {
              duration: 3000,
              panelClass: ['success-snackbar'],
            });
            this.logout();
            const returnUrl = localStorage.getItem('returnUrl') || ''; // Default to root if returnUrl is not set
            this.router.navigate([returnUrl]);
            localStorage.setItem('returnUrl', '');
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('username', username);
            localStorage.setItem('authToken', response)
            localStorage.setItem('formData', JSON.stringify(formData));
          },
          (error) => {
            console.error('Login error:', error);
          }
        );
      }
      else
        this.isPasswordMismatch = true;
    } else {
      this.authForm.markAllAsTouched();
      this.isPasswordMismatch = true;
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
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

    if (!this.forgotPasswordMobile || this.forgotPasswordMobile.length !== 11) {
      this.forgotPasswordError = 'Please enter a valid 11-digit mobile number';
      return;
    }

    this.isSendingCode = true;

    console.log('Sending reset code:', {
      mobile: this.forgotPasswordMobile,
      email: this.forgotPasswordEmail
    });

    // Send with email if provided
    this.apiService.sendPasswordResetCode(this.forgotPasswordMobile, this.forgotPasswordEmail || undefined).subscribe(
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
          this.snackBar.open('Password reset successful!', 'Close', {
            duration: 5000,
            panelClass: ['success-snackbar'],
          });
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