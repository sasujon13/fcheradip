import { Component, OnInit, OnDestroy, Renderer2, HostListener } from '@angular/core';
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

/** Retype password: check character-by-character from position 0; on first mismatch show mismatch; only if all typed chars match and retype is shorter show incomplete. */
function passwordMatchValidator(group: AbstractControl): { [key: string]: unknown } | null {
  const g = group as FormGroup;
  const p = String(g.get('password')?.value ?? '');
  const r = String(g.get('retypePassword')?.value ?? '');
  if (r === '') return null;
  const minLen = Math.min(p.length, r.length);
  for (let i = 0; i < minLen; i++) {
    if (p[i] !== r[i]) {
      return { passwordMismatch: true, mismatchAt: i };
    }
  }
  if (r.length < p.length) return { passwordIncomplete: true };
  if (r.length > p.length) return { passwordMismatch: true, mismatchAt: p.length };
  return null;
}

/** Valid DD/MM/YYYY and at least 5 years old (maxDate is 5 years ago). */
function dobDDMMYYYYValidator(maxDateIso: string): ValidatorFn {
  return (control: AbstractControl): { [key: string]: boolean } | null => {
    const v = control?.value;
    if (!v || typeof v !== 'string') return null; // required is separate
    const parts = v.trim().split('/');
    if (parts.length !== 3) return { invalidDob: true };
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return { invalidDob: true };
    if (month < 1 || month > 12 || day < 1 || day > 31) return { invalidDob: true };
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return { invalidDob: true };
    const max = new Date(maxDateIso);
    if (d > max) return { invalidDob: true }; // too young
    return null;
  };
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

  // Date of birth: stored as DD/MM/YYYY
  maxDate: string;
  showDOBCalendar = false;
  calendarViewDate: Date;
  readonly calendarDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly calendarMonthOptions: { value: number; label: string }[] = [
    { value: 0, label: 'January' }, { value: 1, label: 'February' }, { value: 2, label: 'March' },
    { value: 3, label: 'April' }, { value: 4, label: 'May' }, { value: 5, label: 'June' },
    { value: 6, label: 'July' }, { value: 7, label: 'August' }, { value: 8, label: 'September' },
    { value: 9, label: 'October' }, { value: 10, label: 'November' }, { value: 11, label: 'December' }
  ];
  calendarYearOptions: number[] = [];
  private maxDateObj: Date;

  // Student: Groups and Departments
  availableGroups: any[] = [];
  groupsLoaded = false;  // true after groups API call completes (success or error)
  availableDepartments: any[] = [];
  showGroupField = false;
  showDepartmentField = false;
  currentClassCode: string = '';

  // Teacher: Level, Subjects, Departments
  availableSubjects: any[] = [];
  availableTeacherDepartments: any[] = [];
  showTeacherSubjectField = false;
  showTeacherDepartmentField = false;

  // Levels/Classes from API by country. Levels for Teacher; Classes (Class Zero, Class One...) for Student.
  availableLevels: Array<{ level: string; level_tr: string; label: string }> = [];
  availableClassOptions: { value: string; label: string; has_groups?: boolean }[] = [];
  /** Class options from HSC DB for Teacher add-subject (filtered by level in getter). */
  addSubjectClassOptionsFromApi: { value: string; label: string }[] = [];
  readonly defaultClassOptions: { value: string; label: string; has_groups?: boolean }[] = [
    { value: '0', label: 'Class Zero', has_groups: false },
    { value: '1', label: 'Class One', has_groups: false },
    { value: '5', label: 'Class Five', has_groups: false },
    { value: '8', label: 'Class Eight', has_groups: false },
    { value: '9-10', label: 'Class 9-10', has_groups: true },
    { value: '11-12', label: 'Class 11-12', has_groups: true },
    { value: '13-16', label: 'Degree / Honours / Masters', has_groups: false }
  ];
  /** Full class options 0–8, 9-10, 11-12 for add-subject, filtered by level. */
  readonly allAddSubjectClassOptions: { value: string; label: string }[] = [
    { value: '0', label: 'Class Zero' },
    { value: '1', label: 'Class One' }, { value: '2', label: 'Class Two' }, { value: '3', label: 'Class Three' },
    { value: '4', label: 'Class Four' }, { value: '5', label: 'Class Five' },
    { value: '6', label: 'Class Six' }, { value: '7', label: 'Class Seven' }, { value: '8', label: 'Class Eight' },
    { value: '9-10', label: 'Class 9-10' }, { value: '11-12', label: 'Class 11-12' }
  ];
  readonly defaultLevels: Array<{ level: string; level_tr: string; label: string }> = [
    { level: 'PSC', level_tr: 'PSC', label: 'PSC' },
    { level: 'JSC', level_tr: 'JSC', label: 'JSC' },
    { level: 'SSC', level_tr: 'SSC', label: 'SSC' },
    { level: 'HSC', level_tr: 'HSC', label: 'HSC' },
    { level: 'University', level_tr: 'Degree / Honours / Masters', label: 'Degree / Honours / Masters' }
  ];
  private readonly levelToClassMap: Record<string, string> = {
    'PSC': '5', 'JSC': '8', 'SSC': '9-10', 'HSC': '11-12', 'University': '13-16'
  };
  private readonly levelToClassLabel: Record<string, string> = {
    'PSC': 'PSC (1-5)', 'JSC': 'JSC (6-8)', 'SSC': 'SSC (9-10)', 'HSC': 'HSC (11-12)', 'University': 'Degree / Honours / Masters'
  };

  showAddSubjectPane = false;
  addSubjectSubmitting = false;
  addSubjectForm!: FormGroup;

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
    const today = new Date();
    today.setFullYear(today.getFullYear() - 5);
    this.maxDate = today.toISOString().split('T')[0];
    this.maxDateObj = new Date(this.maxDate + 'T12:00:00');
    this.calendarViewDate = new Date(today);
    this.calendarViewDate.setFullYear(this.calendarViewDate.getFullYear() - 15);
    this.calendarViewDate.setDate(1);
    const maxYear = this.maxDateObj.getFullYear();
    this.calendarYearOptions = Array.from({ length: maxYear - 1940 + 1 }, (_, i) => maxYear - i);

    this.authForm = this.fb.group({
      acctype: ['Student', [Validators.required]],
      fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(31)]],
      dateOfBirth: ['', [Validators.required, dobDDMMYYYYValidator(this.maxDate)]],
      className: [''],
      group: [''],  // Student 9-10, 11-12
      department: [''],  // Student university
      teacherLevel: [''],  // Teacher: PSC, JSC, SSC, HSC, University
      teacherSubject: [''],  // Teacher SSC/HSC
      teacherDepartment: [''],  // Teacher University (or 'OTHER' for custom)
      teacherDepartmentOther: [''],  // Custom department name when teacherDepartment === 'OTHER'
      email: ['', [Validators.required, Validators.email]],
      country: ['United States', [Validators.required]],
      countryCode: ['US', [Validators.required]],
      username: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(15)]],
      password: ['', [Validators.required, Validators.minLength(8), passwordStrengthValidator()]],
      retypePassword: ['', [Validators.required]],
    }, { validators: passwordMatchValidator });
    this.addSubjectForm = this.fb.group({
      subject_name: ['', [Validators.required]],
      subject_translated: ['', [Validators.required]],
      degree_type: [''],
      class_level: ['', []],
    });
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
        // If draft stored date as ISO (YYYY-MM-DD), show as DD/MM/YYYY
        if (formValues.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(formValues.dateOfBirth)) {
          const [y, m, d] = formValues.dateOfBirth.split('-');
          formValues.dateOfBirth = `${d}/${m}/${y}`;
        }
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
        this.phoneMaxLength = this.countryService.getPhoneInputMaxLength(country);
        this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
        this.updatePhoneValidators();
        this.applyBangladeshPhoneDisplay(country.country_code);
        this.signupCountryInitialized = true;
        this.loadLevelsForCountry(country.country_code);
      }
    });

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

    // Check if mobile number is already registered (use normalized number for BD: 0 + 10 digits -> 10 digits)
    this.authForm.get('username')?.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap((username) => {
        const countryCode = this.authForm.get('countryCode')?.value || this.selectedCountry?.country_code;
        const normalized = this.countryService.normalizeMobileNumber(countryCode, username || '');
        if (normalized && normalized.length >= this.phoneMinLength) {
          return this.apiService.checkMobileNumberExists(normalized);
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
    // When Teacher University department changes to/from "Others", update Other field validators
    this.authForm.get('teacherDepartment')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.authForm.get('acctype')?.value === 'Teacher' && this.authForm.get('teacherLevel')?.value === 'University') {
        this.updateTeacherDepartmentOtherValidators();
      }
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
        this.authForm.patchValue({ teacherLevel: '', teacherSubject: '', teacherDepartment: '', teacherDepartmentOther: '' });
      }
    } else {
      this.authForm.get('teacherLevel')?.clearValidators();
      this.authForm.get('teacherSubject')?.clearValidators();
      this.authForm.get('teacherDepartment')?.clearValidators();
      this.authForm.get('teacherDepartmentOther')?.clearValidators();
      this.authForm.patchValue({ teacherLevel: '', teacherSubject: '', teacherDepartment: '', teacherDepartmentOther: '' });
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
    this.authForm.patchValue({ teacherSubject: '', teacherDepartment: '', teacherDepartmentOther: '' });
    this.authForm.get('teacherSubject')?.clearValidators();
    this.authForm.get('teacherDepartment')?.clearValidators();
    this.authForm.get('teacherDepartmentOther')?.clearValidators();

    if (level && level !== 'University') {
      this.showTeacherSubjectField = true;
      this.showTeacherDepartmentField = false;
      this.authForm.get('teacherSubject')?.setValidators([Validators.required]);
      this.loadSubjectsForLevel(level);
    } else if (level === 'University') {
      this.showTeacherSubjectField = true;
      this.showTeacherDepartmentField = false;
      this.authForm.get('teacherSubject')?.setValidators([Validators.required]);
      this.authForm.get('teacherDepartment')?.clearValidators();
      this.loadSubjectsForDegree();
    }
    this.authForm.get('teacherSubject')?.updateValueAndValidity();
    this.authForm.get('teacherDepartment')?.updateValueAndValidity();
    this.authForm.get('teacherDepartmentOther')?.updateValueAndValidity();
  }

  onTeacherSubjectChange(): void {
    const value = this.authForm.get('teacherSubject')?.value;
    if (value === '__ADD_SUBJECT__') {
      this.authForm.patchValue({ teacherSubject: '' });
      this.openAddSubjectPane();
    }
  }

  private updateTeacherDepartmentOtherValidators(): void {
    const isOther = (this.authForm.get('teacherDepartment')?.value || '').toUpperCase() === 'OTHER';
    const ctrl = this.authForm.get('teacherDepartmentOther');
    if (isOther) {
      ctrl?.setValidators([Validators.required, Validators.minLength(2), Validators.maxLength(200)]);
    } else {
      ctrl?.clearValidators();
      this.authForm.patchValue({ teacherDepartmentOther: '' }, { emitEvent: false });
    }
    ctrl?.updateValueAndValidity();
  }

  /** Normalize subject name: remove "1st Paper" / "2nd Paper" and trim. */
  private normalizeSubjectDisplayName(name: string): string {
    if (!name || typeof name !== 'string') return '';
    return name
      .replace(/\s*1st\s*Paper\s*/gi, ' ')
      .replace(/\s*2nd\s*Paper\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Deduplicate by display name and add displayName (subject name with subject_name_tr in parentheses when present). */
  private processSubjectList(subjects: any[]): any[] {
    if (!Array.isArray(subjects) || subjects.length === 0) return [];
    const withDisplay = subjects.map((sub: any) => {
      const name = (sub.subject_name || sub.subject_name_bn || '').trim();
      const tr = (sub.subject_name_tr || sub.subject_translated || '').trim();
      const raw = tr ? `${name} (${tr})` : (name || tr || sub.subject_code || '');
      const displayName = this.normalizeSubjectDisplayName(raw) || raw;
      return { ...sub, displayName };
    });
    const seen = new Set<string>();
    return withDisplay.filter((sub: any) => {
      const key = (sub.displayName || '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Load subjects for Teacher by selected country + level (from cheradip_subject). Fallback to getSubjects() if no country. */
  loadSubjectsForLevel(level: string): void {
    const countryCode = this.selectedCountry?.country_code;
    if (countryCode && level) {
      this.apiService.getSubjectsByCountryLevel(countryCode, level).subscribe({
        next: (res) => {
          const raw = res?.subjects ?? [];
          this.availableSubjects = this.processSubjectList(raw);
        },
        error: (err) => {
          console.error('Error loading subjects by country/level:', err);
          this.availableSubjects = [];
        }
      });
    } else {
      this.apiService.getSubjects().subscribe(
        (response: any) => {
          const raw = Array.isArray(response) ? response : (response?.results || response?.subjects || []);
          this.availableSubjects = this.processSubjectList(raw);
        },
        (error: unknown) => {
          console.error('Error loading subjects:', error);
          this.availableSubjects = [];
        }
      );
    }
  }

  /** Option value for Teacher Subject dropdown: subject_code for Degree, id for others (backend expects teacher_subject_code). */
  getTeacherSubjectOptionValue(sub: any): string | number {
    return this.authForm.get('teacherLevel')?.value === 'University'
      ? (sub.subject_code ?? sub.id)
      : (sub.id ?? sub.subject_code);
  }

  /** Pre-primary has no class choice; always Class Zero. */
  get addSubjectIsPrePrimary(): boolean {
    const levelValue = this.authForm.get('teacherLevel')?.value;
    const levels = (this.availableLevels?.length ? this.availableLevels : this.defaultLevels) as Array<{ level: string; level_tr: string; label: string }>;
    const selected = levels.find((l) => l.level === levelValue);
    const tr = (selected?.level_tr ?? '').toLowerCase();
    return tr.includes('pre-primary') || tr.includes('preprimary');
  }

  /** Allowed class values from selected level/level_tr. Pre-primary → 0 (fixed); Primary/Ibtedayi → 1–5; Junior → 6–8; Secondary/Dakhil → 9-10; Higher Secondary/Alim → 11-12. */
  private get allowedClassValuesForCurrentLevel(): string[] {
    const levelValue = this.authForm.get('teacherLevel')?.value;
    const levels = (this.availableLevels?.length ? this.availableLevels : this.defaultLevels) as Array<{ level: string; level_tr: string; label: string }>;
    const selected = levels.find((l) => l.level === levelValue);
    const tr = (selected?.level_tr ?? '').toLowerCase();
    const level = (selected?.level ?? levelValue ?? '').toUpperCase();
    // Primary, Ibtedayi (ইবতেদায়ি) → classes 1–5
    if (tr.includes('primary') && !tr.includes('pre-primary') && !tr.includes('preprimary') || tr.includes('ibtedayi') || level === 'PSC') {
      return ['1', '2', '3', '4', '5'];
    }
    // Junior Dakhil (জুনিয়র দাখিল), Junior Secondary (নিম্ন-মাধ্যমিক) → 6–8
    if (tr.includes('junior') || level === 'JSC') return ['6', '7', '8'];
    // Alim (আলিম), Higher Secondary (উচ্চ মাধ্যমিক) → 11-12 (check before "secondary" so "higher secondary" doesn’t match 9-10)
    if (tr.includes('higher secondary') || tr.includes('alim') || tr.includes('hsc') || level === 'HSC') return ['11-12'];
    // Dakhil (দাখিল), Secondary (মাধ্যমিক) → 9-10
    if (tr.includes('secondary') || tr.includes('dakhil') || tr.includes('ssc') || level === 'SSC') return ['9-10'];
    return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9-10', '11-12'];
  }

  /** Class options for add-subject: from HSC DB filtered by level; fallback to static list if API not loaded. */
  get addSubjectClassOptions(): { value: string; label: string }[] {
    if (this.addSubjectIsPrePrimary) return [];
    const allowed = this.allowedClassValuesForCurrentLevel;
    const fromApi = this.addSubjectClassOptionsFromApi.filter((o) => allowed.includes(o.value));
    if (fromApi.length > 0) return fromApi;
    return this.allAddSubjectClassOptions.filter((o) => allowed.includes(o.value));
  }

  /** Degree Type options for "Add subject" (stored in Groups column on approve). */
  readonly degreeTypeOptions = [
    'Degree', 'Honours (Pass)', 'Honours', 'B.Sc', 'BSS', 'BBA', 'MBA', 'MSS', 'MSC', 'Others'
  ];

  openAddSubjectPane(): void {
    this.showAddSubjectPane = true;
    const level = this.authForm.get('teacherLevel')?.value;
    const classLevelCtrl = this.addSubjectForm.get('class_level');
    const isPrePrimary = this.addSubjectIsPrePrimary;
    this.addSubjectForm.reset({
      subject_name: '',
      subject_translated: '',
      degree_type: '',
      class_level: isPrePrimary ? '0' : '',
    });
    if (level !== 'University' && classLevelCtrl) {
      if (isPrePrimary) {
        classLevelCtrl.clearValidators();
      } else {
        classLevelCtrl.setValidators([Validators.required]);
      }
    } else if (classLevelCtrl) {
      classLevelCtrl.clearValidators();
    }
    classLevelCtrl?.updateValueAndValidity();
  }

  closeAddSubjectPane(): void {
    this.showAddSubjectPane = false;
  }

  submitNewSubjectRequest(): void {
    if (this.addSubjectForm.invalid || this.addSubjectSubmitting) return;
    const countryCode = this.selectedCountry?.country_code || this.authForm.value.countryCode || 'BD';
    const levelValue = this.authForm.get('teacherLevel')?.value;
    const levels = (this.availableLevels?.length ? this.availableLevels : this.defaultLevels) as Array<{ level: string; level_tr: string; label: string }>;
    const selectedLevel = levels.find((l) => l.level === levelValue);
    this.addSubjectSubmitting = true;
    const degreeType = (this.addSubjectForm.value.degree_type || '').trim() || undefined;
    const body: { subject_name: string; subject_tr: string; subject_translated?: string; degree_type?: string; country_code: string; level?: string; level_tr?: string; class_level?: number | string } = {
      subject_name: this.addSubjectForm.value.subject_name!.trim(),
      subject_tr: this.addSubjectForm.value.subject_translated!.trim(),
      country_code: countryCode,
    };
    if (levelValue) {
      body.level = selectedLevel?.level ?? levelValue;
      if (selectedLevel?.level_tr) body.level_tr = selectedLevel.level_tr;
    }
    if (levelValue === 'University' && degreeType) body.degree_type = degreeType;
    if (levelValue !== 'University') {
      const isPrePrimary = this.addSubjectIsPrePrimary;
      const cl = isPrePrimary ? '0' : this.addSubjectForm.value.class_level;
      if (cl !== '' && cl != null) body.class_level = typeof cl === 'number' ? String(cl) : String(cl);
    }
    this.apiService.submitPendingSubjectRequest(body).subscribe({
      next: (res) => {
        this.addSubjectSubmitting = false;
        this.showAddSubjectPane = false;
        this.snackBar.open(res?.message || 'Your subject request has been submitted for review.', 'Close', { duration: 5000 });
      },
      error: (err) => {
        this.addSubjectSubmitting = false;
        const msg = err?.error?.error || err?.message || 'Request failed.';
        this.snackBar.open(msg, 'Close', { duration: 4000 });
      },
    });
  }

  /** Load subjects for Degree / Honours / Masters (Teacher Level = University) from API. */
  loadSubjectsForDegree(): void {
    const countryCode = this.selectedCountry?.country_code;
    if (!countryCode) {
      this.availableSubjects = [];
      return;
    }
    this.apiService.getSubjectsForDegree(countryCode).subscribe({
      next: (res) => {
        const raw = res?.subjects ?? [];
        this.availableSubjects = this.processSubjectList(raw);
      },
      error: (err) => {
        console.error('Error loading subjects for degree:', err);
        this.availableSubjects = [];
      }
    });
  }

  /** Load university departments from JSON (worldwide, all disciplines). Used when Teacher Level = University. */
  loadTeacherDepartments(): void {
    this.apiService.getUniversityDepartments().subscribe({
      next: (res) => {
        this.availableTeacherDepartments = res?.departments ?? [];
      },
      error: (err) => {
        console.error('Error loading university departments:', err);
        this.availableTeacherDepartments = [];
      }
    });
  }

  onClassChange(className: string): void {
    this.currentClassCode = className || '';
    this.showGroupField = false;
    this.showDepartmentField = false;
    this.availableGroups = [];
    this.groupsLoaded = false;
    this.availableDepartments = [];
    this.authForm.patchValue({ group: '', department: '' });
    this.authForm.get('group')?.clearValidators();
    this.authForm.get('department')?.clearValidators();

    const opt = this.availableClassOptions.find(o => o.value === className);
    const hasGroups = opt?.has_groups === true;
    const isUniClass = ['13', '14', '15', '16', '13-16'].includes(className);

    if (hasGroups) {
      this.showGroupField = true;
      this.authForm.get('group')?.setValidators([Validators.required]);
      this.loadGroupsForClass(className);
    }
    if (isUniClass) {
      this.showDepartmentField = true;
      this.authForm.get('department')?.setValidators([Validators.required]);
      this.loadDepartments();
    }
    this.authForm.get('group')?.updateValueAndValidity();
    this.authForm.get('department')?.updateValueAndValidity();
  }

  /** Load groups for Student from database (Group model via groups_by_class). 9-10, 11-12 map to class_code. */
  loadGroupsForClass(className: string): void {
    const classCode = (className === '9-10' || className === '9' || className === '10') ? '9-10' : (className === '11-12' || className === '11' || className === '12') ? '11-12' : '';
    if (!classCode) {
      this.groupsLoaded = true;
      this.availableGroups = [];
      return;
    }
    this.apiService.getGroupsByClass(classCode).subscribe({
      next: (response: any) => {
        this.groupsLoaded = true;
        this.availableGroups = response?.groups || [];
        if (this.availableGroups.length > 0) {
          const currentGroup = this.authForm.get('group')?.value;
          if (!currentGroup) {
            this.authForm.patchValue({ group: this.availableGroups[0].group_code });
          }
        }
      },
      error: (err: any) => {
        console.error('Error loading groups from database:', err);
        this.groupsLoaded = true;
        this.availableGroups = [];
      }
    });
  }

  /** Load university departments (worldwide, from departments.json). Same list for Student Class 13-16 and Teacher University; not filtered by country. */
  loadDepartments(): void {
    this.apiService.getUniversityDepartments().subscribe({
      next: (res) => {
        this.availableDepartments = res?.departments ?? [];
      },
      error: (err) => {
        console.error('Error loading departments:', err);
        this.availableDepartments = [];
      }
    });
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
    this.phoneMaxLength = this.countryService.getPhoneInputMaxLength(country);
    this.phonePlaceholder = this.countryService.getPhonePlaceholder(country);
    this.updatePhoneValidators();
    this.applyBangladeshPhoneDisplay(country.country_code);

    this.loadLevelsForCountry(country.country_code);
    this.loadClassesForCountry(country.country_code);
    this.loadAddSubjectClassesForCountry(country.country_code);
    const level = this.authForm.get('teacherLevel')?.value;
    if (level && level !== 'University') this.loadSubjectsForLevel(level);
    const className = this.authForm.get('className')?.value;
    if (['9', '10', '11', '12', '9-10', '11-12'].includes(className)) this.loadGroupsForClass(className);
  }

  /** Load unique levels for country (Teacher Level dropdown). */
  private loadLevelsForCountry(countryCode: string): void {
    if (!countryCode) return;
    this.apiService.getLevelsByCountry(countryCode).subscribe({
      next: (res) => {
        this.availableLevels = res?.levels?.length ? res.levels : this.defaultLevels;
      },
      error: () => {
        this.availableLevels = this.defaultLevels;
      }
    });
  }

  /** Load class options from cheradip_subject class column (Student Class dropdown: Class Zero, Class One, ...). */
  private loadClassesForCountry(countryCode: string): void {
    if (!countryCode) return;
    this.apiService.getClassesByCountry(countryCode).subscribe({
      next: (res) => {
        this.availableClassOptions = (res?.classes?.length ? res.classes : this.defaultClassOptions) as { value: string; label: string; has_groups?: boolean }[];
      },
      error: () => {
        this.availableClassOptions = this.defaultClassOptions;
      }
    });
  }

  /** Load class options from HSC DB for Teacher add-subject (only classes that exist in cheradip_hsc.cheradip_subject). */
  private loadAddSubjectClassesForCountry(countryCode: string): void {
    if (!countryCode) return;
    this.apiService.getClassesByCountry(countryCode, { useHsc: true }).subscribe({
      next: (res) => {
        this.addSubjectClassOptionsFromApi = (res?.classes ?? []).map((c) => ({ value: c.value, label: c.label }));
      },
      error: () => {
        this.addSubjectClassOptionsFromApi = [];
      }
    });
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

  /** Open the custom calendar panel. */
  openDOBCalendar(event?: Event): void {
    event?.stopPropagation();
    const dob = this.authForm.get('dateOfBirth')?.value;
    if (dob && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dob)) {
      const [d, m, y] = dob.split('/').map(Number);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        this.calendarViewDate = new Date(y, m - 1, 1);
      }
    } else {
      this.calendarViewDate = new Date(this.maxDateObj);
      this.calendarViewDate.setMonth(this.calendarViewDate.getMonth() - 12);
      this.calendarViewDate.setDate(1);
    }
    this.showDOBCalendar = true;
  }

  closeDOBCalendar(): void {
    this.showDOBCalendar = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const t = event.target as HTMLElement;
    if (this.showDOBCalendar && t && !t.closest('.dob-calendar-panel') && !t.closest('.dob-calendar-wrap')) {
      this.closeDOBCalendar();
    }
  }

  calendarPrevMonth(): void {
    this.calendarViewDate = new Date(this.calendarViewDate.getFullYear(), this.calendarViewDate.getMonth() - 1, 1);
  }

  calendarNextMonth(): void {
    this.calendarViewDate = new Date(this.calendarViewDate.getFullYear(), this.calendarViewDate.getMonth() + 1, 1);
  }

  get calendarViewMonth(): number {
    return this.calendarViewDate.getMonth();
  }
  set calendarViewMonth(month: number) {
    this.calendarViewDate = new Date(this.calendarViewDate.getFullYear(), month, 1);
  }

  get calendarViewYear(): number {
    return this.calendarViewDate.getFullYear();
  }
  set calendarViewYear(year: number) {
    this.calendarViewDate = new Date(year, this.calendarViewDate.getMonth(), 1);
  }

  onCalendarMonthChange(value: string): void {
    const month = parseInt(value, 10);
    if (!isNaN(month) && month >= 0 && month <= 11) this.calendarViewMonth = month;
  }

  onCalendarYearChange(value: string): void {
    const year = parseInt(value, 10);
    if (!isNaN(year) && year >= 1940 && year <= this.maxDateObj.getFullYear()) this.calendarViewYear = year;
  }

  /** Build calendar grid: array of weeks, each week array of { day, date, disabled }. */
  getCalendarWeeks(): { day: number | null; date: Date | null; disabled: boolean }[][] {
    const year = this.calendarViewDate.getFullYear();
    const month = this.calendarViewDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startWeekday = first.getDay();
    const daysInMonth = last.getDate();
    const max = this.maxDateObj;
    const weeks: { day: number | null; date: Date | null; disabled: boolean }[][] = [];
    let week: { day: number | null; date: Date | null; disabled: boolean }[] = [];
    for (let i = 0; i < startWeekday; i++) week.push({ day: null, date: null, disabled: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const disabled = date > max;
      week.push({ day: d, date, disabled });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push({ day: null, date: null, disabled: true });
      weeks.push(week);
    }
    return weeks;
  }

  isSelectedDOBDate(cell: { day: number | null; date: Date | null; disabled: boolean }): boolean {
    if (!cell.date) return false;
    const v = this.authForm.get('dateOfBirth')?.value || '';
    const parts = v.split('/');
    if (parts.length !== 3) return false;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    return cell.date.getDate() === d && cell.date.getMonth() + 1 === m && cell.date.getFullYear() === y;
  }

  selectDOBDate(item: { day: number | null; date: Date | null; disabled: boolean }): void {
    if (!item.date || item.disabled) return;
    const d = item.date.getDate();
    const m = item.date.getMonth() + 1;
    const y = item.date.getFullYear();
    const dd = d < 10 ? '0' + d : '' + d;
    const mm = m < 10 ? '0' + m : '' + m;
    this.authForm.get('dateOfBirth')?.setValue(`${dd}/${mm}/${y}`, { emitEvent: true });
    this.closeDOBCalendar();
    this.updateDefaultPassword();
  }

  /** Format digits as DD/MM/YYYY (day/month/year). Slashes always visible; update DOM immediately. */
  onDOBInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const raw = (input.value || '').replace(/\D/g, '');
    const formatted = this.formatDOBSlashes(raw);
    const ctrl = this.authForm.get('dateOfBirth');
    if (ctrl) ctrl.setValue(formatted, { emitEvent: true });
    // Keep slashes always visible: set input value so DOM is never missing "/"
    input.value = formatted;
    const selStart = input.selectionStart ?? 0;
    let newCursor = Math.min(selStart, formatted.length);
    if (formatted[newCursor] === '/') newCursor++;
    input.setSelectionRange(newCursor, newCursor);
    this.updateDefaultPassword();
  }

  /** Build DD/MM/YYYY from raw digits only. */
  private formatDOBSlashes(raw: string): string {
    let s = raw.slice(0, 2);
    if (raw.length > 2) s += '/' + raw.slice(2, 4);
    if (raw.length > 4) s += '/' + raw.slice(4, 8);
    return s;
  }

  /** Backspace/Delete: remove only digits, never the "/" characters. */
  onDOBKeydown(e: KeyboardEvent): void {
    const input = e.target as HTMLInputElement;
    const value = input.value || '';
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      const hasSelection = start !== end;
      const wouldRemoveSlash = hasSelection
        ? value.slice(start, end).includes('/')
        : (e.key === 'Backspace' && start > 0 && value[start - 1] === '/') ||
          (e.key === 'Delete' && start < value.length && value[start] === '/');
      if (wouldRemoveSlash) {
        e.preventDefault();
        if (hasSelection) {
          // Remove only digits in the selection, then re-format so "/" stay visible
          const withoutSelectionDigits = value
            .split('')
            .map((c, i) => (i >= start && i < end && /\d/.test(c) ? '' : c))
            .join('');
          const raw = withoutSelectionDigits.replace(/\D/g, '');
          const formatted = this.formatDOBSlashes(raw);
          const ctrl = this.authForm.get('dateOfBirth');
          if (ctrl) ctrl.setValue(formatted, { emitEvent: true });
          input.value = formatted;
          const newCursor = Math.min(start, formatted.length);
          setTimeout(() => input.setSelectionRange(newCursor, newCursor), 0);
          this.updateDefaultPassword();
        } else {
          if (e.key === 'Backspace' && start > 0) {
            const digitIdx = this.lastDigitIndexBefore(value, start);
            if (digitIdx >= 0) this.removeDOBDigit(input, digitIdx);
          } else if (e.key === 'Delete' && start < value.length) {
            const digitIdx = this.firstDigitIndexAfter(value, start);
            if (digitIdx >= 0) this.removeDOBDigit(input, digitIdx);
          }
        }
      }
    }
  }

  private lastDigitIndexBefore(value: string, pos: number): number {
    for (let i = pos - 1; i >= 0; i--) if (/\d/.test(value[i])) return i;
    return -1;
  }

  private firstDigitIndexAfter(value: string, pos: number): number {
    for (let i = pos + 1; i < value.length; i++) if (/\d/.test(value[i])) return i;
    return -1;
  }

  private removeDOBDigit(input: HTMLInputElement, removeIdx: number): void {
    const value = input.value || '';
    const newValue = value.slice(0, removeIdx) + value.slice(removeIdx + 1);
    const raw = newValue.replace(/\D/g, '');
    const formatted = this.formatDOBSlashes(raw);
    const ctrl = this.authForm.get('dateOfBirth');
    if (ctrl) ctrl.setValue(formatted, { emitEvent: true });
    // Keep slashes visible: set input value immediately
    input.value = formatted;
    const digitsBefore = (value.slice(0, removeIdx).match(/\d/g) || []).length;
    const newCursor = digitsBefore <= 2 ? digitsBefore : digitsBefore <= 4 ? digitsBefore + 1 : digitsBefore + 2;
    setTimeout(() => {
      input.setSelectionRange(newCursor, newCursor);
    }, 0);
    this.updateDefaultPassword();
  }

  /** Parse DD/MM/YYYY and return year, or undefined if invalid. */
  private parseDDMMYYYY(value: string): number | undefined {
    if (!value || typeof value !== 'string') return undefined;
    const s = value.trim();
    const parts = s.split('/');
    if (parts.length !== 3) return undefined;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return undefined;
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
    return year;
  }

  updateDefaultPassword(): void {
    const fullName = this.authForm.get('fullName')?.value || '';
    const dateOfBirth = this.authForm.get('dateOfBirth')?.value;

    if (fullName && fullName.length >= 3 && dateOfBirth) {
      const birthYear = this.parseDDMMYYYY(dateOfBirth);
      if (birthYear == null) return;
      const namePart = fullName.substring(0, 3);
      const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
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
    return dateOfBirth ? this.parseDDMMYYYY(dateOfBirth) : undefined;
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

  onAuth(): void {
    const acctype = this.authForm.value.acctype;
    const className = this.authForm.value.className;

    // Student validation
    if (acctype === 'Student') {
      if (['9', '10', '11', '12', '9-10', '11-12'].includes(className)) {
        if (!this.authForm.value.group) {
          this.snackBar.open('Please select a group', 'Close', { duration: 3000 });
          return;
        }
      }
      if (['13', '14', '15', '16', '13-16'].includes(className)) {
        if (!this.authForm.value.department) {
          this.snackBar.open('Please select a department', 'Close', { duration: 3000 });
          return;
        }
      }
    }

    // Teacher validation
    if (acctype === 'Teacher') {
      const level = this.authForm.value.teacherLevel;
      if (level === 'PSC' || level === 'JSC' || level === 'SSC' || level === 'HSC') {
        if (!this.authForm.value.teacherSubject) {
          this.snackBar.open('Please select a subject', 'Close', { duration: 3000 });
          return;
        }
      }
      if (level === 'University') {
        if (!this.authForm.value.teacherSubject) {
          this.snackBar.open('Please select a subject', 'Close', { duration: 3000 });
          return;
        }
      }
    }

    if (this.authForm.valid && !this.isMobileNumberRegistered) {
      const pwdControl = this.authForm.get('password');
      const useDefaultPassword = pwdControl?.pristine && this.defaultPassword;
      const passwordToUse = useDefaultPassword ? this.defaultPassword : (this.authForm.value.password || '');
      const birthYear = this.getYearFromDOB();
      const countryCode = this.authForm.value.countryCode || this.selectedCountry?.country_code || 'BD';
      const usernameNormalized = this.countryService.normalizeMobileNumber(countryCode, this.authForm.value.username || '');
      const formData: any = {
        acctype: this.authForm.value.acctype,
        fullName: this.authForm.value.fullName,
        username: usernameNormalized,
        password: passwordToUse,
        date_of_birth: this.authForm.value.dateOfBirth,
        year_of_birth: birthYear,
        class_name: acctype === 'Student' ? (this.authForm.value.className || null) : null,
        group: acctype === 'Student' ? (this.authForm.value.group || null) : null,
        department: acctype === 'Student' ? (this.authForm.value.department || null) : null,
        teacher_level: acctype === 'Teacher' ? (this.authForm.value.teacherLevel || null) : null,
        teacher_subject_code: acctype === 'Teacher' ? (this.authForm.value.teacherSubject || null) : null,
        teacher_department_code: acctype === 'Teacher' && this.authForm.value.teacherLevel !== 'University' ? (this.authForm.value.teacherDepartment || null) : null,
        teacher_department_name: acctype === 'Teacher' && this.authForm.value.teacherLevel !== 'University' && (this.authForm.value.teacherDepartment || '').toUpperCase() === 'OTHER'
          ? (this.authForm.value.teacherDepartmentOther || '').trim() || null
          : null,
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

          // Update header immediately: show profile menu, hide login/signup (same as login success)
          this.showLoggedInHeader();

          const returnUrl = localStorage.getItem('returnUrl') || '/';
          this.router.navigateByUrl(returnUrl).then(() => {
            localStorage.setItem('returnUrl', '');
            const scrollY = sessionStorage.getItem('signupReturnScrollY');
            if (scrollY != null) {
              sessionStorage.removeItem('signupReturnScrollY');
              requestAnimationFrame(() => window.scrollTo(0, parseInt(scrollY, 10)));
            }
          });
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

  /** Update header to show profile menu and hide login/signup (same as login success). */
  private showLoggedInHeader(): void {
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
}
