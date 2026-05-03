import { Component, ElementRef, OnInit, AfterViewInit, Renderer2, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ValidatorFn, AbstractControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/service/api.service';
import { CountryService } from 'src/app/service/country.service';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { LoadingService } from 'src/app/service/loading.service';


@Component({
  selector: 'app-auth',
  templateUrl: './password.component.html',
  styleUrls: ['./password.component.css']
})

export class PasswordComponent implements OnInit {
  @ViewChild('consoleOutput') consoleOutput: ElementRef | undefined;
  authForm: FormGroup;
  isPasswordMismatch = false;
  isPasswordMismatch3 = false;
  isMobileNumberRegistered = false;
  isPasswordLength = false;
  isPasswordLength2 = false;
  showPassword: boolean = false;
  jsonData: any;
  username: any = '';

  // Forgot Password Modal (same as login.component.ts)
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
    private countryService: CountryService,
    private snackBar: MatSnackBar,
    private http: HttpClient,
    private renderer: Renderer2,
    private loadingService: LoadingService
  ) {
    this.authForm = this.fb.group({
      // ... form controls ...
    });

    this.username = localStorage.getItem('username');
  }

  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');

    if (searchBarElement) {
      searchBarElement.style.display = 'none';
    }

    const savedAuthFormData = localStorage.getItem('authFormData');
    if (savedAuthFormData) {
      const authData = JSON.parse(savedAuthFormData);
      this.authForm.patchValue(authData);
    }
    this.authForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(11), Validators.maxLength(11)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(14)]],
      newpassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(14)]],
      confirmpassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(14), this.confirmPasswordValidator()]],
    });
    this.authForm.get('username')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((username) => {
          if (username.length === 11) {
            return this.apiService.checkMobileNumberExists(username);
          }
          return of(false);
        })
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
          if (password.length > 5 && password.length < 15) {
            return this.apiService.checkPasswordExists(username, password);

          }
          return of(false);
        })
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
      
    this.authForm.get('newpassword')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((password) => {
          const username = this.authForm.get('username')?.value;
          if (password.length > 5 && password.length < 15) {
            this.isPasswordLength2 = false;

          }
          else{
            this.isPasswordLength2 = true;
          }
          return of(false);
        })
      )
      .subscribe((response: any) => {
        if (!response) {}
        else  { }
      });

    this.authForm.get('confirmpassword')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((password) => {
          const username = this.authForm.get('username')?.value;
          if (password.length > 5 && password.length < 15) {
            const newpassword = this.authForm.get('newpassword')?.value;
            const confirmpassword = this.authForm.get('confirmpassword')?.value;
            if (newpassword === confirmpassword) {
              this.isPasswordMismatch3 = false;
            } else {
              this.isPasswordMismatch3 = true;
            }

          }
          return of(false);
        })
      )
      .subscribe((response: any) => {
        if (!response) { }
        else { }
      });

  }

    ngAfterViewInit(): void {
      const signMenu = document.getElementById('sign_menu');
      if (signMenu) {
        this.renderer.setStyle(signMenu, 'display', 'flex');
      }
      setTimeout(() => this.loadingService.completeOne(), 0);
    }
  hasEmptyFields() {
    const formControls = this.authForm.controls;
    for (const key in formControls) {
      if (formControls[key].value === '') {
        return true;
      }
    }
    return false;
  }
  navigateToSignupWithReturnIntent(): void {
    sessionStorage.setItem('signupFromAppNav', '1');
    void this.router.navigate(['/auth']);
  }

  onAuth() {
    this.authForm.markAllAsTouched();
    if (this.hasEmptyFields()) {
      this.handleResponse("Please Fillup the Red-Marked Fields!");
    }
    else {
      if (this.authForm.valid) {
        const username = this.authForm.value.username;
        const password = this.authForm.value.password;
        const newpassword = this.authForm.value.newpassword;
        const formData = this.authForm.value;
        localStorage.setItem('formData', JSON.stringify(formData));
        this.apiService.updatePassword(username, password, newpassword).subscribe(
          (response) => {
            this.snackBar.open('Password Update Successful!', 'Close', {
              duration: 3000,
              panelClass: ['success-snackbar'],
            });
            this.logout();
            const returnUrl = localStorage.getItem('returnUrl') || ''; // Default to root if returnUrl is not set
            this.router.navigate([returnUrl]);
            localStorage.setItem('returnUrl', '');
            localStorage.setItem('username', username);
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('authToken', response)
            localStorage.setItem('formData', JSON.stringify(formData));
          },
          (error) => {
            console.error('Signup error:', error);
          }
        );
      } else {
        this.handleResponse("You have Invalid Data! Please Correct!");
        this.authForm.markAllAsTouched();
      }
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

  handleResponse(response: any) {

    if (this.consoleOutput) {
      const consoleOutputDiv = this.consoleOutput.nativeElement;
      consoleOutputDiv.textContent = '';
    }
    const formattedMessage = this.formatResponseMessage(response);

    // Append the formatted console output message
    if (this.consoleOutput) {
      const consoleOutputDiv = this.consoleOutput.nativeElement;
      consoleOutputDiv.textContent = formattedMessage;
    }
  }
  formatResponseMessage(response: any): string {
    let formattedMessage = JSON.stringify(response);

    // Remove curly braces {}
    formattedMessage = formattedMessage.replace(/[{()}]/g, '');

    // Remove "error:" and "message:"
    formattedMessage = formattedMessage.replace(/"error":/g, '');
    formattedMessage = formattedMessage.replace(/"message":/g, '');

    // Trim leading and trailing whitespace
    formattedMessage = formattedMessage.trim();
    if (formattedMessage.includes("Order Created Successfully")) {
      this.snackBar.open('Order Created Successfully!', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar'],
      });
      this.router.navigate(['/products']);
    }
    return formattedMessage;
  }

  // Forgot Password (same as login.component.ts)
  openForgotPassword(): void {
    this.showForgotPasswordModal = true;
    this.forgotPasswordStep = 1;
    this.forgotPasswordMobile = this.username || this.authForm.get('username')?.value || '';
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
    const formData = localStorage.getItem('formData');
    let countryCode = 'BD';
    if (formData) {
      try {
        const data = JSON.parse(formData);
        countryCode = data.country_code || data.countryCode || 'BD';
      } catch (_) {}
    }
    const mobileNormalized = this.countryService.normalizeMobileNumber(countryCode, this.forgotPasswordMobile);
    const len = mobileNormalized.replace(/\D/g, '').length;
    const validLength = this.countryService.isBangladesh(countryCode) ? len === 10 : (len >= 10 && len <= 15);
    if (!this.forgotPasswordMobile || !validLength) {
      this.forgotPasswordError = this.countryService.isBangladesh(countryCode)
        ? 'Please enter a valid 10 or 11-digit mobile number (e.g. 01712345678)'
        : 'Please enter a valid mobile number';
      return;
    }
    this.isSendingCode = true;
    this.apiService.sendPasswordResetCode(mobileNormalized, this.forgotPasswordEmail || undefined).subscribe(
      (response: any) => {
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
        this.isSendingCode = false;
        this.forgotPasswordError = error.error?.message || error.error?.error || error.message || 'Failed to send code. Please try again.';
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
    this.apiService.resetPasswordWithCode(this.forgotPasswordMobile, this.verificationCode, this.newPassword).subscribe(
      (response: any) => {
        this.isResetting = false;
        if (response.success) {
          this.forgotPasswordSuccess = 'Password reset successful! You can now login.';
          this.snackBar.open('Password reset successful!', 'Close', { duration: 5000, panelClass: ['success-snackbar'] });
          setTimeout(() => this.closeForgotPasswordModal(), 2000);
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

  confirmPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const newpassword = this.authForm.get('newpassword')?.value;
      const confirmpassword = control.value;

      if (newpassword === confirmpassword) {
        return null; // Validation passes, passwords match
      } else {
        return { 'passwordMismatch3': true }; // Validation fails, passwords do not match
      }
    };
  }
}