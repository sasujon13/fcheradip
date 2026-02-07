import { Component, OnInit, OnDestroy, Output, EventEmitter, Input, forwardRef, ElementRef, HostListener } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, take, takeUntil } from 'rxjs/operators';
import { CountryService, Country } from '../../service/country.service';

@Component({
  selector: 'app-country-selector',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './country-selector.component.html',
  styleUrls: ['./country-selector.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CountrySelectorComponent),
      multi: true
    }
  ]
})
export class CountrySelectorComponent implements OnInit, OnDestroy, ControlValueAccessor {

  @Input() placeholder: string = 'Select Country';
  @Input() showPhoneCode: boolean = true;
  @Input() showFlag: boolean = true;
  @Input() compact: boolean = false;  // Compact mode for header
  @Output() countryChange = new EventEmitter<Country>();

  searchControl = new FormControl('');
  selectedCountry: Country | null = null;
  filteredCountries: Country[] = [];
  featuredCountries: Country[] = [];
  allCountries: Country[] = [];
  isDropdownOpen: boolean = false;
  isLoading: boolean = false;

  private destroy$ = new Subject<void>();
  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};
  /** When true, form provided the value (writeValue); do not overwrite with country$ */
  private valueSetByForm = false;

  constructor(
    private countryService: CountryService,
    private elementRef: ElementRef
  ) {}

  ngOnInit(): void {
    this.isLoading = true;
    // Load featured (optional): show Popular section; sort by country name ascending
    this.countryService.getFeaturedCountries().subscribe({
      next: (countries) => this.featuredCountries = this.sortCountriesByName(countries || []),
      error: () => {}
    });
    // Load all countries; fallback to getCountriesForOptions if main list is empty
    this.countryService.getAllCountries().pipe(
      catchError(() => this.countryService.getCountriesForOptions())
    ).subscribe({
      next: (countries) => {
        let list = Array.isArray(countries) ? countries : [];
        if (list.length === 0) {
          this.countryService.getCountriesForOptions().subscribe({
            next: (fallback) => {
              list = Array.isArray(fallback) ? fallback : [];
              this.allCountries = this.sortCountriesByName(list);
              this.filteredCountries = this.allCountries;
              this.isLoading = false;
            },
            error: () => { this.isLoading = false; }
          });
          return;
        }
        this.allCountries = this.sortCountriesByName(list);
        this.filteredCountries = this.allCountries;
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; }
    });

    // Sync initial country from service only when form did not provide a value
    this.countryService.country$.pipe(take(1)).subscribe(c => {
      if (this.valueSetByForm) return;
      if (c) {
        this.selectedCountry = c;
        this.searchControl.setValue(c.country_name, { emitEvent: false });
      }
    });

    // Subscribe to search changes
    this.searchControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.filterCountries(searchTerm || '');
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ControlValueAccessor implementation
  writeValue(value: string | Country): void {
    if (typeof value === 'string' && value) {
      this.valueSetByForm = true;
      this.countryService.getCountry(value).subscribe({
        next: (country) => {
          this.selectedCountry = country;
          this.searchControl.setValue(country.country_name, { emitEvent: false });
        },
        error: () => {
          // Resolve from already-loaded list if available (avoids console noise when list has the country)
          const code = (value || '').toUpperCase();
          const found = this.allCountries.find(c => (c.country_code || '').toUpperCase() === code);
          if (found) {
            this.selectedCountry = found;
            this.searchControl.setValue(found.country_name, { emitEvent: false });
          }
        }
      });
    } else if (value && typeof value === 'object') {
      this.valueSetByForm = true;
      this.selectedCountry = value;
      this.searchControl.setValue(value.country_name, { emitEvent: false });
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    if (isDisabled) {
      this.searchControl.disable();
    } else {
      this.searchControl.enable();
    }
  }

  private sortCountriesByName(countries: Country[]): Country[] {
    return [...countries].sort((a, b) =>
      (a.country_name || '').localeCompare(b.country_name || '', undefined, { sensitivity: 'base' })
    );
  }

  // Filter countries based on search term; keep sort by country name ascending
  // When user types and list is closed, open it so they see results
  filterCountries(searchTerm: string): void {
    const term = (searchTerm || '').trim();
    if (term.length >= 1 && !this.isDropdownOpen) {
      this.isDropdownOpen = true;
      this.filteredCountries = this.allCountries;
    }
    if (!searchTerm || searchTerm.length < 1) {
      this.filteredCountries = this.allCountries;
      return;
    }

    const lowerSearch = searchTerm.toLowerCase();
    const filtered = this.allCountries.filter(country =>
      country.country_name.toLowerCase().includes(lowerSearch) ||
      (country.country_name_native && country.country_name_native.toLowerCase().includes(lowerSearch)) ||
      country.country_code.toLowerCase().includes(lowerSearch) ||
      country.phone_code.includes(lowerSearch)
    );
    this.filteredCountries = this.sortCountriesByName(filtered);
  }

  // Select a country
  selectCountry(country: Country): void {
    this.selectedCountry = country;
    this.searchControl.setValue(country.country_name, { emitEvent: false });
    this.isDropdownOpen = false;
    
    // Emit change
    this.onChange(country.country_code);
    this.countryChange.emit(country);
    this.onTouched();
  }

  // Toggle dropdown
  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.isDropdownOpen) {
      this.filteredCountries = this.allCountries;
      this.searchControl.setValue('', { emitEvent: false });
    }
  }

  // Open dropdown
  openDropdown(): void {
    this.isDropdownOpen = true;
    this.filteredCountries = this.allCountries;
  }

  // Close dropdown when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isDropdownOpen = false;
      // Reset search to selected country name
      if (this.selectedCountry) {
        this.searchControl.setValue(this.selectedCountry.country_name, { emitEvent: false });
      }
    }
  }

  // Clear selection
  clearSelection(): void {
    this.selectedCountry = null;
    this.searchControl.setValue('');
    this.onChange('');
  }

  // Handle input focus
  onInputFocus(): void {
    this.isDropdownOpen = true;
    if (this.selectedCountry) {
      // Clear input for searching but keep selection
      this.searchControl.setValue('', { emitEvent: false });
    }
  }
}
