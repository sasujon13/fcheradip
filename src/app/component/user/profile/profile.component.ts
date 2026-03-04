import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/service/api.service';
import { CountryService, Country } from 'src/app/service/country.service';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';


@Component({
  selector: 'app-auth',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})

export class ProfileComponent implements OnInit {
  @ViewChild('consoleOutput') consoleOutput: ElementRef | undefined;
  authForm: FormGroup;
  isPasswordMismatch = false;
  isMobileNumberRegistered = false;
  isPasswordLength = false;
  showPassword: boolean = false;
  jsonData: any = {
    division: '',
    district: '',
    thana: '',
    paymentMethod: ''
  };

  divisions: string[] = [];
  districts: string[] = [];
  thanas: string[] = [];
  selectedCountry: Country | null = null;
  username: any;
  fullName: any;
  gender: any;
  union: any;
  village: any;
  /** Read-only display: mobile number (username) from profile. */
  displayUsername: string = '';

  // Change Password Modal
  showChangePasswordModal = false;
  changePasswordStep = 1;
  changePasswordEmail = '';
  verificationCode = '';
  newPassword = '';
  confirmPassword = '';
  userHasEmail = false;
  isSendingCode = false;
  isVerifying = false;
  isChangingPassword = false;
  changePasswordError = '';
  changePasswordSuccess = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private countryService: CountryService,
    private snackBar: MatSnackBar,
  ) {
    this.authForm = this.fb.group({
      countryCode: ['BD', [Validators.required]],
      acctype: ['Student'],
      username: [''],
      password: [''],
      fullName: [''],
      dateOfBirth: [''],  // YYYY-MM-DD for input type="date"
      group: ['Science'],
      gender: ['Male'],
      division: [''],
      district: [''],
      thana: [''],
      union: [''],
      village: ['']
    });
  }

  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'none';
    }
    const username = localStorage.getItem('username');
    const formData = localStorage.getItem('formData');
    const acctypeFromStorage = formData ? (() => { try { return JSON.parse(formData).acctype; } catch { return undefined; } })() : undefined;
    // Fetch profile from API and patch form so account type, full name, DOB, mobile etc. show retrieved values
    if (username) {
      this.displayUsername = username;
      this.apiService.getProfile(username, acctypeFromStorage).subscribe({
        next: (data: any) => {
          const patch: any = {
            acctype: data.acctype || 'Student',
            fullName: data.fullName || '',
            countryCode: data.country_code || 'BD',
            gender: data.gender || 'Male',
            group: data.group || 'Science',
            division: data.division || '',
            district: data.district || '',
            thana: data.thana || '',
            union: data.union || '',
            village: data.village || '',
            dateOfBirth: data.date_of_birth || '',
            username: data.username || username
          };
          this.authForm.patchValue(patch, { emitEvent: false });
          this.displayUsername = data.username || username;
          this.jsonData.fullName = patch.fullName;
          this.jsonData.union = patch.union;
          this.jsonData.village = patch.village;
          const countryCode = (patch.countryCode || 'BD').toString().trim();
          this.countryService.getCountry(countryCode).subscribe({
            next: (c) => {
              this.selectedCountry = c;
              this.loadLocationsForCountry(c.country_code, false);
              this.loadDistrictsAndThanasForCurrentSelection();
            },
            error: () => this.loadLocationsForCountry(countryCode, false)
          });
        },
        error: () => {
          this.applyLocalStoragePatch();
          this.setCountryAndLocations();
        }
      });
    } else {
      this.applyLocalStoragePatch();
      this.setCountryAndLocations();
    }

    this.setupFormValidatorsAndLocalStorageRefs();
    this.setupValueChangeSubscriptions();
  }

  private applyLocalStoragePatch(): void {
    const savedAuthFormData = localStorage.getItem('authFormData');
    const formData = localStorage.getItem('formData');
    const dataToPatch = savedAuthFormData ? JSON.parse(savedAuthFormData) : (formData ? JSON.parse(formData) : null);
    if (dataToPatch) {
      this.authForm.patchValue(dataToPatch, { emitEvent: false });
    }
    const u = localStorage.getItem('username');
    if (u) this.displayUsername = u;
  }

  private setCountryAndLocations(): void {
    const countryCode = (this.authForm.get('countryCode')?.value || 'BD').toString().trim();
    this.countryService.getCountry(countryCode).subscribe({
      next: (c) => {
        this.selectedCountry = c;
        this.loadLocationsForCountry(c.country_code, false);
        this.loadDistrictsAndThanasForCurrentSelection();
      },
      error: () => this.loadLocationsForCountry(countryCode, false)
    });
  }

  private setupFormValidatorsAndLocalStorageRefs(): void {
    const scienceC = document.getElementById('science');
    const businessC = document.getElementById('business');
    const humanitiesC = document.getElementById('humanities');

    const science = document.getElementById('scienceSubjects');
    const science2 = document.getElementById('scienceSubjects2');
    const arts = document.getElementById('humanitiesSubjects');
    const arts2 = document.getElementById('humanitiesSubjects2');
    const arts3 = document.getElementById('humanitiesSubjects3');
    const business = document.getElementById('businessSubjects');
    const business2 = document.getElementById('businessSubjects2');
    const business3 = document.getElementById('businessSubjects3');
  
    if (scienceC && arts && arts2 && arts3 && business && business2 && business3 && science && science2) {

      science.style.display = 'flex';
      science2.style.display = 'flex';

      arts.style.display = 'none';
      arts2.style.display = 'none';
      arts3.style.display = 'none';

      business.style.display = 'none';
      business2.style.display = 'none';
      business3.style.display = 'none';
    }
    
    if (humanitiesC && arts && arts2 && arts3 && business && business2 && business3 && science && science2) {

      science.style.display = 'none';
      science2.style.display = 'none';

      arts.style.display = 'flex';
      arts2.style.display = 'flex';
      arts3.style.display = 'flex';

      business.style.display = 'none';
      business2.style.display = 'none';
      business3.style.display = 'none';
    }
    
    if (businessC && arts && arts2 && arts3 && business && business2 && business3 && science && science2) {

      science.style.display = 'none';
      science2.style.display = 'none';

      arts.style.display = 'none';
      arts2.style.display = 'none';
      arts3.style.display = 'none';

      business.style.display = 'flex';
      business2.style.display = 'flex';
      business3.style.display = 'flex';
    }
    
    this.authForm.get('countryCode')?.setValue(this.authForm.get('countryCode')?.value || 'BD', { emitEvent: false });
    this.authForm.get('acctype')?.setValidators([Validators.required, Validators.maxLength(7)]);
    this.authForm.get('username')?.setValidators([Validators.required, Validators.minLength(10), Validators.maxLength(15)]);
    this.authForm.get('password')?.setValidators([Validators.required, Validators.minLength(6), Validators.maxLength(14)]);
    this.authForm.get('fullName')?.setValidators([Validators.required, Validators.maxLength(31)]);
    this.authForm.get('group')?.setValidators([Validators.required, Validators.maxLength(18)]);
    this.authForm.get('gender')?.setValidators([Validators.required, Validators.maxLength(6)]);
    this.authForm.get('division')?.setValidators([Validators.required, Validators.maxLength(31)]);
    this.authForm.get('district')?.setValidators([Validators.required, Validators.maxLength(31)]);
    this.authForm.get('thana')?.setValidators([Validators.required, Validators.maxLength(31)]);
    this.authForm.get('union')?.setValidators([Validators.required, Validators.maxLength(31)]);
    this.authForm.get('village')?.setValidators([Validators.required, Validators.maxLength(255)]);
    this.authForm.updateValueAndValidity();

    this.username = localStorage.getItem('username');
    this.jsonData.username = this.username;
    this.fullName = localStorage.getItem('fullName');
    this.jsonData.fullName = this.fullName;
    this.gender = localStorage.getItem('gender');
    this.jsonData.gender = this.gender;
    this.union = localStorage.getItem('union');
    this.jsonData.union = this.union;
    this.village = localStorage.getItem('village');
    this.jsonData.village = this.village;
  }

  private setupValueChangeSubscriptions(): void {
    this.authForm.get('username')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((username) => {
          if (username && username.length === 11) {
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
          if (password && password.length > 5 && password.length < 15) {
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
  onAuth() {
    this.authForm.markAllAsTouched();
    if (this.hasEmptyFields()) {
      this.handleResponse("Please Fillup the Red-Marked Fields!");
    }
    else {
      if (this.authForm.valid && this.isPasswordMismatch === false) {
        const username = this.authForm.value.username;
        const acctype = this.authForm.value.acctype;
        const fullName = this.authForm.value.fullName;
        const password = this.authForm.value.password;
        const group = this.authForm.value.group;
        const gender = this.authForm.value.gender;
        const division = this.authForm.value.division;
        const district = this.authForm.value.district;
        const thana = this.authForm.value.thana;
        const union = this.authForm.value.union;
        const village = this.authForm.value.village;
        const countryCode = this.authForm.value.countryCode;
        const formData = this.authForm.value;
        localStorage.setItem('formData', JSON.stringify(formData));
        const dateOfBirth = this.authForm.value.dateOfBirth || null;
        this.apiService.update(
          username,
          acctype,
          fullName,
          group,
          gender,
          division,
          district,
          thana,
          union,
          village,
          password,
          countryCode,
          dateOfBirth
        ).subscribe(
          (response: any) => {
            this.snackBar.open('Profile Update Successful!', 'Close', {
              duration: 3000,
              panelClass: ['success-snackbar'],
            });
            const token = response?.authToken || response?.token || response;
            if (token) localStorage.setItem('authToken', token);
            this.logout();
            const returnUrl = localStorage.getItem('returnUrl') || '';
            this.router.navigate([returnUrl]);
            localStorage.setItem('returnUrl', '');
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('formData', JSON.stringify(formData));
          },
          (error) => {
            console.error('Update error:', error);
          }
        );
      } else {
        this.handleResponse("You have Invalid Data! Please Correct!");
        this.authForm.markAllAsTouched();
      }
    }
  }

  onCountryChange(country: Country): void {
    this.selectedCountry = country;
    this.authForm.patchValue({ countryCode: country.country_code }, { emitEvent: false });
    this.loadLocationsForCountry(country.country_code, true);
  }

  /** Load divisions from Location table for the selected country. When clearLocation is true, clear division/district/thana (e.g. on country change). */
  loadLocationsForCountry(countryCode: string, clearLocation = true): void {
    if (clearLocation) {
      this.divisions = [];
      this.districts = [];
      this.thanas = [];
      this.authForm.patchValue({ division: '', district: '', thana: '' }, { emitEvent: false });
    }
    if (!countryCode) return;
    this.apiService.getDivisionsByCountry(countryCode).subscribe({
      next: (data: string[]) => {
        this.divisions = data || [];
        if (!clearLocation && this.authForm.get('division')?.value) {
          this.loadDistrictsAndThanasForCurrentSelection();
        }
      },
      error: (err) => {
        console.error('Error fetching divisions by country:', err);
        this.divisions = [];
      }
    });
  }

  /** Load districts and thanas for current division/district (used when restoring saved form). */
  private loadDistrictsAndThanasForCurrentSelection(): void {
    const countryCode = this.authForm.get('countryCode')?.value || this.selectedCountry?.country_code || 'BD';
    const division = this.authForm.get('division')?.value;
    const district = this.authForm.get('district')?.value;
    if (!countryCode || !division) return;
    this.apiService.getDistrictsByCountry(countryCode, division).subscribe({
      next: (data: string[]) => {
        this.districts = data || [];
        if (district) {
          this.apiService.getThanasByCountry(countryCode, division, district).subscribe({
            next: (thanaData: string[]) => { this.thanas = thanaData || []; },
            error: () => { this.thanas = []; }
          });
        }
      },
      error: () => { this.districts = []; }
    });
  }

  onDivisionChange(): void {
    const countryCode = this.authForm.get('countryCode')?.value || this.selectedCountry?.country_code || 'BD';
    const selectedDivision = this.authForm.get('division')?.value;
    this.districts = [];
    this.thanas = [];
    this.authForm.patchValue({ district: '', thana: '' }, { emitEvent: false });
    if (countryCode && selectedDivision) {
      this.apiService.getDistrictsByCountry(countryCode, selectedDivision).subscribe({
        next: (data: string[]) => { this.districts = data || []; },
        error: () => { this.districts = []; }
      });
    }
  }

  onDistrictChange(): void {
    const countryCode = this.authForm.get('countryCode')?.value || this.selectedCountry?.country_code || 'BD';
    const selectedDivision = this.authForm.get('division')?.value;
    const selectedDistrict = this.authForm.get('district')?.value;
    this.thanas = [];
    this.authForm.patchValue({ thana: '' }, { emitEvent: false });
    if (countryCode && selectedDivision && selectedDistrict) {
      this.apiService.getThanasByCountry(countryCode, selectedDivision, selectedDistrict).subscribe({
        next: (data: string[]) => { this.thanas = data || []; },
        error: () => { this.thanas = []; }
      });
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

  // =========================================================================
  // CHANGE PASSWORD METHODS
  // =========================================================================

  openChangePassword(): void {
    this.showChangePasswordModal = true;
    this.changePasswordStep = 1;
    this.changePasswordEmail = '';
    this.verificationCode = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.changePasswordError = '';
    this.changePasswordSuccess = '';
  }

  closeChangePasswordModal(): void {
    this.showChangePasswordModal = false;
    this.changePasswordStep = 1;
    this.changePasswordError = '';
    this.changePasswordSuccess = '';
  }

  sendChangePasswordCode(): void {
    this.changePasswordError = '';
    this.changePasswordSuccess = '';
    
    const username = localStorage.getItem('username');
    if (!username) {
      this.changePasswordError = 'Please login first';
      return;
    }

    this.isSendingCode = true;

    this.apiService.sendPasswordResetCode(username).subscribe(
      (response: any) => {
        this.isSendingCode = false;
        if (response.success) {
          this.changePasswordSuccess = response.message || 'Verification code sent!';
          this.changePasswordStep = 2;
        } else if (response.needs_email) {
          this.userHasEmail = false;
          this.changePasswordError = 'Please provide an email address.';
        } else {
          this.changePasswordError = response.message || 'Failed to send code.';
        }
      },
      (error: any) => {
        this.isSendingCode = false;
        this.changePasswordError = error.error?.message || 'Failed to send code.';
      }
    );
  }

  verifyChangePasswordCode(): void {
    this.changePasswordError = '';
    this.changePasswordSuccess = '';

    if (!this.verificationCode || this.verificationCode.length !== 6) {
      this.changePasswordError = 'Please enter a valid 6-digit code';
      return;
    }

    const username = localStorage.getItem('username');
    if (!username) {
      this.changePasswordError = 'Please login first';
      return;
    }

    this.isVerifying = true;

    this.apiService.verifyCode(username, this.verificationCode).subscribe(
      (response: any) => {
        this.isVerifying = false;
        if (response.success) {
          this.changePasswordSuccess = 'Code verified!';
          this.changePasswordStep = 3;
        } else {
          this.changePasswordError = response.message || 'Invalid or expired code.';
        }
      },
      (error: any) => {
        this.isVerifying = false;
        this.changePasswordError = error.error?.message || 'Invalid or expired code.';
      }
    );
  }

  changePassword(): void {
    this.changePasswordError = '';
    this.changePasswordSuccess = '';

    if (!this.newPassword || this.newPassword.length < 6 || this.newPassword.length > 14) {
      this.changePasswordError = 'Password must be 6-14 characters';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.changePasswordError = 'Passwords do not match';
      return;
    }

    const username = localStorage.getItem('username');
    if (!username) {
      this.changePasswordError = 'Please login first';
      return;
    }

    this.isChangingPassword = true;

    this.apiService.resetPasswordWithCode(
      username,
      this.verificationCode,
      this.newPassword
    ).subscribe(
      (response: any) => {
        this.isChangingPassword = false;
        if (response.success) {
          this.changePasswordSuccess = 'Password changed successfully!';
          this.snackBar.open('Password changed successfully!', 'Close', {
            duration: 5000,
            panelClass: ['success-snackbar'],
          });
          setTimeout(() => {
            this.closeChangePasswordModal();
          }, 2000);
        } else {
          this.changePasswordError = response.message || 'Failed to change password.';
        }
      },
      (error: any) => {
        this.isChangingPassword = false;
        this.changePasswordError = error.error?.message || 'Failed to change password.';
      }
    );
  }
}