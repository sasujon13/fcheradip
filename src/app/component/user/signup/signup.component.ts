import { Component, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators, ValidatorFn } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { CountrySelectorComponent } from '../../../shared/country-selector/country-selector.component';
import { ApiService } from '../../../service/api.service';
import { CountryService, Country } from '../../../service/country.service';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

const SIGNUP_DRAFT_KEY = 'signupFormDraft';

/** Password must contain at least one letter, one number, and one special character. */
function passwordStrengthValidator(): ValidatorFn {
  return (control: AbstractControl): { [key: string]: boolean } | null => {
    const v = control?.value;
    if (!v) return null;
    const hasLetter = /[a-zA-Z]/.test(v);
    const hasNumber = /[0-9]/.test(v);
    const hasSpecial = /[^a-zA-Z0-9]/.test(v);
    return hasLetter && hasNumber && hasSpecial ? null : { passwordStrength: true };
  };
}

/** Retype password must match password. */
function passwordMatchValidator(group: AbstractControl): { [key: string]: boolean } | null {
  const g = group as FormGroup;
  const p = g.get('password')?.value;
  const r = g.get('retypePassword')?.value;
  if (p == null || p === '' || r == null || r === '') return null;
  return p === r ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, CountrySelectorComponent],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent implements OnInit, OnDestroy {
  authForm: FormGroup;
  isMobileNumberRegistered = false;
  showPassword = false;
  defaultPassword = '';

  // Country & phone settings
  selectedCountry: Country | null = null;
  countriesList: Country[] = [];
  phonePlaceholder = 'Your Mobile Number';
  phoneMinLength = 10;
  phoneMaxLength = 11;

  // Date of birth settings
  maxDate: string;

  // Student: Groups and Departments
  availableGroups: any[] = [];
  availableDepartments: any[] = [];
  showGroupField = false;
  showDepartmentField = false;
  currentClassCode: string = '';

  // Teacher: Level, Subjects, Departments
  availableSubjects: any[] = [];
  availableTeacherDepartments: any[] = [];
  showTeacherSubjectField = false;
  showTeacherDepartmentField = false;

  private destroy$ = new Subject<void>();
  private restoringDraft = false;
  /** When set, ignore country$ emissions that don't match (e.g. from IP) and re-apply this country. Cleared when user picks a country. */
  private restoredDraftCountryCode: string | null = null;
  /** True after user (or our default) sets country in signup; prevents header/service from overwriting signup form. */
  private signupCountryInitialized = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private snackBar: MatSnackBar,
    private renderer: Renderer2,
    private countryService: CountryService
  ) {
    this.authForm = this.fb.group({
      acctype: ['Student', [Validators.required]],
      fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(31)]],
      dateOfBirth: ['', [Validators.required]],
      className: [''],
      group: [''],  // Student 9-10, 11-12
      department: [''],  // Student university
      teacherLevel: [''],  // Teacher: PSC, JSC, SSC, HSC, University
      teacherSubject: [''],  // Teacher SSC/HSC
      teacherDepartment: [''],  // Teacher University
      email: ['', [Validators.required, Validators.email]],
      country: ['United States', [Validators.required]],
      countryCode: ['US', [Validators.required]],
      username: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(15)]],
      password: ['', [Validators.required, Validators.minLength(8), passwordStrengthValidator()]],
      retypePassword: ['', [Validators.required]],
    }, { validators: passwordMatchValidator });

    // Set max date to 5 years ago (minimum age)
    const today = new Date();
    today.setFullYear(today.getFullYear() - 5);
    this.maxDate = today.toISOString().split('T')[0];
  }

  ngOnInit(): void {
    // Hide search bar if exists
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'none';
    }

    // Load countries for dropdown (GET /api/country/)
    this.countryService.getCountriesForOptions().subscribe({
      next: (countries: Country[]) => this.countriesList = countries,
      error: (err: unknown) => console.error('Error loading countries:', err)
    });

    // Restore draft from localStorage (last entered data)
    const draft = localStorage.getItem(SIGNUP_DRAFT_KEY);
    if (draft) {
      try {
        const data = JSON.parse(draft);
        const { country_code, password, retypePassword, ...formValues } = data;
        this.restoringDraft = true;
        const draftCountryCode = country_code || data.countryCode || 'BD';
        this.restoredDraftCountryCode = draftCountryCode; // keep this country even if IP/detect overwrites later
        this.authForm.patchValue({ ...formValues, countryCode: draftCountryCode }, { emitEvent: false });
        this.countryService.getCountry(draftCountryCode).subscribe({
          next: (c: Country) => {
            this.onCountryChange(c);
            this.restoringDraft = false;
          },
          error: () => { this.restoringDraft = false; }
        });
        // After account-type/class/level logic runs, re-apply draft so group/department/subject restore
        setTimeout(() => {
          this.onAccountTypeChange();
          this.authForm.patchValue(formValues, { emitEvent: false });
          this.updateDefaultPassword();
        }, 0);
      } catch (_) {}
    } else {
      // No draft: default signup country from header (selectedCountry) or from preferred language. Skip 'ORIGINAL' (Website Language) — not a real country for phone.
      const defaultCountryCode = localStorage.getItem('selectedCountry');
      if (defaultCountryCode && defaultCountryCode !== 'ORIGINAL') {
        this.countryService.getCountry(defaultCountryCode).subscribe({
          next: (c: Country) => this.onCountryChange(c),
          error: () => this.setSignupDefaultCountryByPreferredLang()
        });
      } else {
        this.setSignupDefaultCountryByPreferredLang();
      }
    }

    // Persist form to localStorage on change (remember last entered data); omit password for security
    this.authForm.valueChanges.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      const value = this.authForm.getRawValue();
      const { password, retypePassword, ...rest } = value;
      const draftData = {
        ...rest,
        country_code: this.selectedCountry?.country_code || value.countryCode || null
      };
      localStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draftData));
    });

    // Subscribe to country changes (from service/header): only apply to signup form before user has seen a default (initial sync only)
    this.countryService.country$.pipe(takeUntil(this.destroy$)).subscribe((country: Country | null) => {
      if (this.restoringDraft) return;
      if (this.signupCountryInitialized) return; // don't overwrite once we've set signup default or user chose country
      if (this.restoredDraftCountryCode != null && country && country.country_code !== this.restoredDraftCountryCode) {
        this.countryService.getCountry(this.restoredDraftCountryCode).subscribe({
          next: (c: Country) => this.onCountryChange(c),
          error: () => {}
        });
        return;
      }
      if (country) {
        this.selectedCountry = country;
        this.authForm.patchValue({ countryCode: country.country_code, country: country.country_name }, { emitEvent: false });
        this.phoneMinLength = country.phone_length_min || 10;
        this.phoneMaxLength = country.phone_length_max || 11;
        this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
        this.updatePhoneValidators();
        this.signupCountryInitialized = true;
      }
    });

    // Check if mobile number is already registered
    this.authForm.get('username')?.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap((username) => {
        if (username && username.length >= this.phoneMinLength) {
          return this.apiService.checkMobileNumberExists(username);
        }
        return of(false);
      }),
      takeUntil(this.destroy$)
    ).subscribe((response: any) => {
      this.isMobileNumberRegistered = response?.exists || false;
    });

    // Update default password when name or DOB changes
    this.authForm.get('fullName')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateDefaultPassword();
    });
    this.authForm.get('dateOfBirth')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateDefaultPassword();
    });

    // When password is edited and has at least 1 char, require retype; when hidden, clear retype and unrequire
    this.authForm.get('password')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncRetypeValidators());
    this.syncRetypeValidators(); // init: retype row hidden => no required on retype

    // Watch for class changes to load groups/departments (Student)
    this.authForm.get('className')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((className) => {
      this.onClassChange(className);
    });
    // Watch for teacher level changes
    this.authForm.get('teacherLevel')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.onTeacherLevelChange();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    const signMenu = document.getElementById('sign_menu');
    if (signMenu) {
      this.renderer.setStyle(signMenu, 'display', 'flex');
    }
  }

  onAccountTypeChange(): void {
    const accType = this.authForm.get('acctype')?.value;
    if (accType === 'Teacher' || accType === 'JobSeeker') {
      this.authForm.get('className')?.clearValidators();
      this.authForm.patchValue({ className: '', group: '', department: '' });
      this.showGroupField = false;
      this.showDepartmentField = false;
      this.availableGroups = [];
      this.availableDepartments = [];
      if (accType === 'Teacher') {
        this.onTeacherLevelChange();
      } else {
        this.showTeacherSubjectField = false;
        this.showTeacherDepartmentField = false;
        this.authForm.patchValue({ teacherLevel: '', teacherSubject: '', teacherDepartment: '' });
      }
    } else {
      this.authForm.get('teacherLevel')?.clearValidators();
      this.authForm.get('teacherSubject')?.clearValidators();
      this.authForm.get('teacherDepartment')?.clearValidators();
      this.authForm.patchValue({ teacherLevel: '', teacherSubject: '', teacherDepartment: '' });
      this.showTeacherSubjectField = false;
      this.showTeacherDepartmentField = false;
      this.onClassChange(this.authForm.get('className')?.value);
    }
    this.authForm.get('className')?.updateValueAndValidity();
    this.authForm.get('teacherLevel')?.updateValueAndValidity();
    this.authForm.get('teacherSubject')?.updateValueAndValidity();
    this.authForm.get('teacherDepartment')?.updateValueAndValidity();
  }

  onTeacherLevelChange(): void {
    const level = this.authForm.get('teacherLevel')?.value;
    this.showTeacherSubjectField = false;
    this.showTeacherDepartmentField = false;
    this.availableSubjects = [];
    this.availableTeacherDepartments = [];
    this.authForm.patchValue({ teacherSubject: '', teacherDepartment: '' });
    this.authForm.get('teacherSubject')?.clearValidators();
    this.authForm.get('teacherDepartment')?.clearValidators();

    if (level === 'SSC' || level === 'HSC') {
      this.showTeacherSubjectField = true;
      this.authForm.get('teacherSubject')?.setValidators([Validators.required]);
      this.loadSubjects();
    } else if (level === 'University') {
      this.showTeacherDepartmentField = true;
      this.authForm.get('teacherDepartment')?.setValidators([Validators.required]);
      this.loadTeacherDepartments();
    }
    this.authForm.get('teacherSubject')?.updateValueAndValidity();
    this.authForm.get('teacherDepartment')?.updateValueAndValidity();
  }

  loadSubjects(): void {
    this.apiService.getSubjects().subscribe(
      (response: any) => {
        this.availableSubjects = Array.isArray(response) ? response : (response?.results || response?.subjects || []);
      },
      (error: unknown) => {
        console.error('Error loading subjects:', error);
        this.availableSubjects = [];
      }
    );
  }

  loadTeacherDepartments(): void {
    this.apiService.getDepartments().subscribe(
      (response: any) => {
        this.availableTeacherDepartments = response?.departments || [];
      },
      (error: any) => {
        console.error('Error loading teacher departments:', error);
        this.availableTeacherDepartments = [];
      }
    );
  }

  onClassChange(className: string): void {
    this.currentClassCode = className || '';
    
    // Reset fields
    this.showGroupField = false;
    this.showDepartmentField = false;
    this.availableGroups = [];
    this.availableDepartments = [];
    this.authForm.patchValue({ group: '', department: '' });
    
    // Class 5 and 8: No groups
    if (className === '5' || className === '8') {
      this.authForm.get('group')?.clearValidators();
      this.authForm.get('department')?.clearValidators();
      this.authForm.get('group')?.updateValueAndValidity();
      this.authForm.get('department')?.updateValueAndValidity();
      return;
    }
    
    // Class 9-10 and 11-12: Load groups
    if (className === '9-10' || className === '11-12') {
      this.showGroupField = true;
      this.showDepartmentField = false;
      this.authForm.get('group')?.setValidators([Validators.required]);
      this.authForm.get('department')?.clearValidators();
      this.loadGroupsForClass(className);
      this.authForm.get('group')?.updateValueAndValidity();
      this.authForm.get('department')?.updateValueAndValidity();
      return;
    }
    
    // Class 13-16: Load departments
    if (className === '13-16') {
      this.showGroupField = false;
      this.showDepartmentField = true;
      this.authForm.get('group')?.clearValidators();
      this.authForm.get('department')?.setValidators([Validators.required]);
      this.loadDepartments();
      this.authForm.get('group')?.updateValueAndValidity();
      this.authForm.get('department')?.updateValueAndValidity();
      return;
    }
  }

  loadGroupsForClass(classCode: string): void {
    this.apiService.getGroupsByClass(classCode).subscribe(
      (response: any) => {
        this.availableGroups = response?.groups || [];
        if (this.availableGroups.length > 0) {
          // Set default to first group if none selected
          const currentGroup = this.authForm.get('group')?.value;
          if (!currentGroup && this.availableGroups.length > 0) {
            this.authForm.patchValue({ group: this.availableGroups[0].group_code });
          }
        }
      },
      (error: any) => {
        console.error('Error loading groups:', error);
        this.availableGroups = [];
      }
    );
  }

  loadDepartments(): void {
    this.apiService.getDepartments().subscribe(
      (response: any) => {
        this.availableDepartments = response?.departments || [];
      },
      (error: any) => {
        console.error('Error loading departments:', error);
        this.availableDepartments = [];
      }
    );
  }

  /** Update only signup form and phone rules. Does not change header language/country. */
  onCountryChange(country: Country): void {
    this.signupCountryInitialized = true;
    if (!this.restoringDraft) {
      this.restoredDraftCountryCode = null; // user (or we) explicitly set country; stop defending draft
    }
    this.selectedCountry = country;
    // Do not call countryService.setCountry() — signup country is form-only; header language stays unchanged
    this.authForm.patchValue({ country: country.country_name, countryCode: country.country_code }, { emitEvent: false });

    this.phoneMinLength = country.phone_length_min || 10;
    this.phoneMaxLength = country.phone_length_max || 11;
    this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
    this.updatePhoneValidators();
  }

  onCountrySelect(): void {
    const code = this.authForm.get('countryCode')?.value;
    if (code) {
      this.countryService.getCountry(code).subscribe({
        next: (c: Country) => this.onCountryChange(c),
        error: () => {}
      });
    }
  }

  /** When no saved country, set signup default from preferred language (e.g. bn → Bangladesh); default to US for en/original. */
  private setSignupDefaultCountryByPreferredLang(): void {
    try {
      const lang = localStorage.getItem('preferred_lang') || 'en';
      if (lang === 'en' || lang === 'original' || !lang) {
        this.countryService.getCountry('US').subscribe({
          next: (c: Country) => this.onCountryChange(c),
          error: () => {}
        });
        return;
      }
      this.countryService.getCountryByLanguageCode(lang).subscribe({
        next: (c: Country | null) => { if (c) this.onCountryChange(c); },
        error: () => {}
      });
    } catch (_) {}
  }

  onNameOrYearChange(): void {
    this.updateDefaultPassword();
  }

  updateDefaultPassword(): void {
    const fullName = this.authForm.get('fullName')?.value || '';
    const dateOfBirth = this.authForm.get('dateOfBirth')?.value;

    if (fullName && fullName.length >= 3 && dateOfBirth) {
      const namePart = fullName.substring(0, 3);
      const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
      const birthYear = new Date(dateOfBirth).getFullYear();
      this.defaultPassword = `${formattedName}@${birthYear}`;
      const pwd = this.authForm.get('password');
      if (pwd && !pwd.value) {
        this.authForm.patchValue({ password: this.defaultPassword }, { emitEvent: false });
      }
    } else {
      this.defaultPassword = '';
    }
    this.syncRetypeValidators(); // re-evaluate retype visibility when suggestion changes
  }

  getYearFromDOB(): number | undefined {
    const dateOfBirth = this.authForm.get('dateOfBirth')?.value;
    if (dateOfBirth) {
      return new Date(dateOfBirth).getFullYear();
    }
    return undefined;
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  /** Show retype when password dirty, has length >= 1, and differs from suggested default; require retype only then. */
  private syncRetypeValidators(): void {
    const pwd = this.authForm.get('password');
    const showRetype = !!pwd?.dirty && ((pwd?.value?.length || 0) >= 1) && pwd?.value !== this.defaultPassword;
    const retype = this.authForm.get('retypePassword');
    if (retype) {
      if (showRetype) {
        retype.setValidators([Validators.required]);
      } else {
        retype.clearValidators();
        retype.setValue('', { emitEvent: false });
      }
      retype.updateValueAndValidity();
      this.authForm.updateValueAndValidity();
    }
  }

  /** Phone code for display (e.g. +880); updates when country changes; fallback from form countryCode if needed. */
  get displayPhoneCode(): string {
    const c = this.selectedCountry;
    if (c?.phone_code) {
      const code = c.phone_code.trim();
      return code.startsWith('+') ? code : '+' + code;
    }
    const code = this.authForm.get('countryCode')?.value;
    const found = this.countriesList.find(x => (x.country_code || '').toUpperCase() === (code || '').toUpperCase());
    if (found?.phone_code) {
      const p = found.phone_code.trim();
      return p.startsWith('+') ? p : '+' + p;
    }
    return '';
  }

  private updatePhoneValidators(): void {
    this.authForm.get('username')?.setValidators([
      Validators.required,
      Validators.minLength(this.phoneMinLength),
      Validators.maxLength(this.phoneMaxLength)
    ]);
    this.authForm.get('username')?.updateValueAndValidity();
  }

  onAuth(): void {
    const acctype = this.authForm.value.acctype;
    const className = this.authForm.value.className;

    // Student validation
    if (acctype === 'Student') {
      if (className === '9-10' || className === '11-12') {
        if (!this.authForm.value.group) {
          this.snackBar.open('Please select a group', 'Close', { duration: 3000 });
          return;
        }
      }
      if (className === '13-16') {
        if (!this.authForm.value.department) {
          this.snackBar.open('Please select a department', 'Close', { duration: 3000 });
          return;
        }
      }
    }

    // Teacher validation
    if (acctype === 'Teacher') {
      const level = this.authForm.value.teacherLevel;
      if (level === 'SSC' || level === 'HSC') {
        if (!this.authForm.value.teacherSubject) {
          this.snackBar.open('Please select a subject', 'Close', { duration: 3000 });
          return;
        }
      }
      if (level === 'University') {
        if (!this.authForm.value.teacherDepartment) {
          this.snackBar.open('Please select a department', 'Close', { duration: 3000 });
          return;
        }
      }
    }

    if (this.authForm.valid && !this.isMobileNumberRegistered) {
      const pwdControl = this.authForm.get('password');
      const useDefaultPassword = pwdControl?.pristine && this.defaultPassword;
      const passwordToUse = useDefaultPassword ? this.defaultPassword : (this.authForm.value.password || '');
      const birthYear = this.getYearFromDOB();
      const formData: any = {
        acctype: this.authForm.value.acctype,
        fullName: this.authForm.value.fullName,
        username: this.authForm.value.username,
        password: passwordToUse,
        date_of_birth: this.authForm.value.dateOfBirth,
        year_of_birth: birthYear,
        class_name: acctype === 'Student' ? (this.authForm.value.className || null) : null,
        group: acctype === 'Student' ? (this.authForm.value.group || null) : null,
        department: acctype === 'Student' ? (this.authForm.value.department || null) : null,
        teacher_level: acctype === 'Teacher' ? (this.authForm.value.teacherLevel || null) : null,
        teacher_subject_code: acctype === 'Teacher' ? (this.authForm.value.teacherSubject || null) : null,
        teacher_department_code: acctype === 'Teacher' ? (this.authForm.value.teacherDepartment || null) : null,
        gender: 'Male',
        email: this.authForm.value.email,
        country_code: this.authForm.value.countryCode || this.selectedCountry?.country_code || 'BD',
      };

      this.apiService.signupWithData(formData).subscribe(
        (response: any) => {
          this.snackBar.open(`Account created! Your password is: ${passwordToUse}`, 'Close', {
            duration: 10000,
            panelClass: ['success-snackbar'],
          });

          // Store user data
          localStorage.setItem('username', formData.username);
          localStorage.setItem('fullName', formData.fullName);
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('authToken', response.authToken || response);
          localStorage.setItem('formData', JSON.stringify(formData));
          localStorage.removeItem(SIGNUP_DRAFT_KEY);

          const returnUrl = localStorage.getItem('returnUrl') || '';
          this.router.navigate([returnUrl]);
          localStorage.setItem('returnUrl', '');
        },
        (error: any) => {
          console.error('Signup error:', error);
          this.snackBar.open('Signup failed. Please try again.', 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar'],
          });
        }
      );
    } else {
      this.authForm.markAllAsTouched();
    }
  }
}
