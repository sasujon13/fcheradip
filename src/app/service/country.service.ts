import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface Country {
  country_code: string;
  country_code_alpha3?: string;
  country_code_numeric?: string;
  country_name: string;
  country_name_native?: string;
  country_name_official?: string;
  flag_emoji?: string;
  flag_url?: string;
  phone_code: string;
  phone_code_numeric?: number;
  phone_format?: string;
  phone_length_min?: number;
  phone_length_max?: number;
  language_codes?: string[];  // from country table, e.g. ['bn'], ['en','hi']
  continent?: string;
  region?: string;
  capital?: string;
  currency_code?: string;
  currency_symbol?: string;
  timezone?: string;
  display_order?: number;
  is_featured?: boolean;
  is_active?: boolean;
}

export interface CountryDetectionResult {
  detected: boolean;
  ip: string;
  country?: Country;
  source?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CountryService {

  private baseUrl = environment.apiUrl;

  // Global country state
  private currentCountry$ = new BehaviorSubject<Country | null>(null);
  public country$ = this.currentCountry$.asObservable();
  
  // Cache for countries list
  private countriesCache: Country[] | null = null;
  private featuredCountriesCache: Country[] | null = null;

  /** Language code for the site's original mixed Bengali + English (no Google Translate). */
  static readonly ORIGINAL_LANG = 'original';
  /** Fake country code for "Website Language" option in the header. */
  static readonly WEBSITE_LANGUAGE_COUNTRY_CODE = 'ORIGINAL';

  // Preferred UI language and country-for-that-lang (so flag = user-selected country)
  private static readonly PREFERRED_LANG_KEY = 'preferred_lang';
  private static readonly PREFERRED_LANG_COUNTRY_KEY = 'preferred_lang_country';
  /** Cache so we can restore icon on reload before API returns, and keep it when API fails. */
  private static readonly SELECTED_COUNTRY_CACHE_KEY = 'selectedCountryCache';
  private preferredLang$ = new BehaviorSubject<string>(CountryService.getStoredPreferredLang());

  /** Fake country for "Website Language" (original Bengali + English mixed). */
  static getWebsiteLanguageCountry(): Country {
    return {
      country_code: CountryService.WEBSITE_LANGUAGE_COUNTRY_CODE,
      country_name: 'Website Language',
      language_codes: [CountryService.ORIGINAL_LANG],
      flag_emoji: '🌐',
      phone_code: '',
      phone_length_min: 10,
      phone_length_max: 15
    };
  }

  private static getStoredPreferredLang(): string {
    try {
      const s = localStorage.getItem(CountryService.PREFERRED_LANG_KEY);
      return s || 'en';
    } catch {
      return 'en';
    }
  }

  constructor(private http: HttpClient) {
    this.initializeCountry();
  }

  /**
   * Initialize country on service creation.
   * By default use Website Language (original Bengali + English) when user has not chosen a language. If user had a previous selection in localStorage, use that.
   * On restore failure we do not overwrite localStorage so the next reload can try again.
   */
  async initializeCountry(): Promise<void> {
    const savedCountryCode = localStorage.getItem('selectedCountry');

    if (savedCountryCode === CountryService.WEBSITE_LANGUAGE_COUNTRY_CODE) {
      this.setCountry(CountryService.getWebsiteLanguageCountry(), false);
      return;
    }
    if (savedCountryCode) {
      // Restore icon immediately from cache so preferred language sustains after reload (and if API fails we keep it)
      try {
        const cached = localStorage.getItem(CountryService.SELECTED_COUNTRY_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as Partial<Country>;
          if (parsed && parsed.country_code === savedCountryCode) {
            const country: Country = {
              country_code: parsed.country_code!,
              country_name: parsed.country_name ?? savedCountryCode,
              flag_url: parsed.flag_url,
              flag_emoji: parsed.flag_emoji,
              language_codes: parsed.language_codes,
              phone_code: parsed.phone_code ?? '',
              phone_length_min: parsed.phone_length_min ?? 10,
              phone_length_max: parsed.phone_length_max ?? 15
            };
            this.currentCountry$.next(country);
          }
        }
      } catch (_) {}
      this.getCountry(savedCountryCode).subscribe({
        next: (country) => this.setCountry(country, false),
        error: () => { /* keep displayed country from cache; do not overwrite with default */ }
      });
    } else {
      this.setDefaultWebsiteLanguage(true);
    }
  }

  /** Set default to Website Language (original Bengali + English mixed); optionally save to localStorage. */
  private setDefaultWebsiteLanguage(save: boolean = true): void {
    this.setCountry(CountryService.getWebsiteLanguageCountry(), save);
  }

  /** Set default country by country code (e.g. 'US'); optionally save to localStorage. */
  private setDefaultByCountryCode(countryCode: string, save: boolean = true): void {
    this.getCountry(countryCode).subscribe({
      next: (country) => this.setCountry(country, save),
      error: () => this.setDefaultWebsiteLanguage(save)
    });
  }

  /** Set default country by language code (e.g. 'bn') from the countries list; optionally save to localStorage. */
  private setDefaultByLanguageCode(langCode: string, save: boolean = true): void {
    this.getAllCountries().subscribe({
      next: (list) => {
        const country = (list || []).find(c =>
          Array.isArray(c.language_codes) && c.language_codes.includes(langCode)
        );
        if (country) {
          this.setCountry(country, save);
        }
      },
      error: () => {}
    });
  }

  /**
   * Detect country from IP and set it
   */
  private detectAndSetCountry(): void {
    this.detectCountryFromIP().subscribe({
      next: (result) => {
        if (result.detected && result.country) {
          this.setCountry(result.country, true);
        } else if (result.country) {
          // Use default/fallback
          this.setCountry(result.country, true);
        }
      },
      error: () => this.setDefaultByCountryCode('US')
    });
  }

  /**
   * Detect country from IP address
   */
  detectCountryFromIP(): Observable<CountryDetectionResult> {
    return this.http.get<CountryDetectionResult>(`${this.baseUrl}/countries/detect/`);
  }

  /**
   * Get UI language code for a country (for converting page data to that language).
   * Countries with multiple languages: use the first language in language_codes.
   */
  getLanguageFromCountry(country: Country): string {
    if (country.country_code === CountryService.WEBSITE_LANGUAGE_COUNTRY_CODE) return CountryService.ORIGINAL_LANG;
    if (country.language_codes && Array.isArray(country.language_codes) && country.language_codes.length > 0) {
      const first = country.language_codes[0];
      if (first && typeof first === 'string') return first;
    }
    if (country.country_code === 'BD') return 'bn';
    return 'en';
  }

  /**
   * Set current country and optionally save to localStorage as default.
   * Uses the country's language_codes (first code) as the site language: updates preferred
   * language, document <html lang> and dir, and all future API requests send X-Language
   * so the entire website (API content + document language) follows the selected country.
   */
  setCountry(country: Country, save: boolean = true, triggerTranslate: boolean = false): void {
    this.currentCountry$.next(country);
    const lang = this.getLanguageFromCountry(country);
    this.setPreferredLang(lang, country.country_code);
    if (save) {
      localStorage.setItem('selectedCountry', country.country_code);
      try {
        localStorage.setItem(CountryService.SELECTED_COUNTRY_CACHE_KEY, JSON.stringify({
          country_code: country.country_code,
          country_name: country.country_name,
          flag_url: country.flag_url,
          flag_emoji: country.flag_emoji,
          language_codes: country.language_codes
        }));
      } catch (_) {}
    }
    if (triggerTranslate) {
      this.applyGoogleTranslateLang(lang);
    }
  }

  /**
   * Get current selected country
   */
  getCurrentCountry(): Country | null {
    return this.currentCountry$.getValue();
  }

  /**
   * Get a country that uses the given language code (e.g. 'bn' → Bangladesh).
   * Used to default signup country from preferred language when no country is saved.
   */
  getCountryByLanguageCode(langCode: string): Observable<Country | null> {
    if (!langCode || langCode === 'en') return of(null);
    return this.getAllCountries().pipe(
      map(list => (list || []).find(c =>
        Array.isArray(c.language_codes) && c.language_codes.includes(langCode)
      ) || null)
    );
  }

  /**
   * Get single country by code. Falls back to list lookup if detail endpoint fails (404/500/CORS).
   */
  getCountry(code: string): Observable<Country> {
    const upper = (code || '').toUpperCase();
    return this.http.get<Country>(`${this.baseUrl}/countries/${code}/`).pipe(
      catchError(() =>
        this.getAllCountries().pipe(
          map(list => list.find(c => (c.country_code || '').toUpperCase() === upper) || null),
          switchMap(c => (c ? of(c) : throwError(() => new Error('Country not found'))))
        )
      )
    );
  }

  /**
   * Get all active countries from cheradip_country (GET /api/countries/).
   */
  getAllCountries(): Observable<Country[]> {
    if (this.countriesCache) {
      return of(this.countriesCache);
    }
    
    const url = `${this.baseUrl}/countries/`;
    console.log('[CountryService] GET', url);
    return this.http.get<Country[]>(url).pipe(
      map((body: any) => Array.isArray(body) ? body : (body?.results ?? body?.data ?? [])),
      tap(countries => {
        console.log('[CountryService] countries/ response:', Array.isArray(countries) ? countries.length : 0, 'items');
        if (countries?.length) this.countriesCache = countries;
      }),
      catchError((err) => {
        console.error('[CountryService] countries/ failed:', err?.status ?? err?.message ?? err);
        if (err?.status === 0) console.error('[CountryService] Likely CORS or network error. Use ng serve (proxy) or enable CORS on backend.');
        return of([]);
      })
    );
  }

  /**
   * Get all active countries from cheradip_country for dropdowns (GET /api/country/).
   */
  getCountriesForOptions(): Observable<Country[]> {
    const url = `${this.baseUrl}/country/`;
    console.log('[CountryService] GET', url);
    return this.http.get<Country[]>(url).pipe(
      map((body: any) => Array.isArray(body) ? body : (body?.results ?? [])),
      tap(list => console.log('[CountryService] country/ response:', Array.isArray(list) ? list.length : 0, 'items')),
      catchError((err) => {
        console.error('[CountryService] country/ failed:', err?.status ?? err?.message ?? err);
        return this.getAllCountries();
      })
    );
  }

  /**
   * Get featured countries (for quick selection dropdown)
   */
  getFeaturedCountries(): Observable<Country[]> {
    if (this.featuredCountriesCache) {
      return of(this.featuredCountriesCache);
    }
    const url = `${this.baseUrl}/countries/featured/`;
    console.log('[CountryService] GET', url);
    return this.http.get<Country[]>(url).pipe(
      map((body: any) => Array.isArray(body) ? body : (body?.results ?? [])),
      tap(countries => {
        console.log('[CountryService] countries/featured/ response:', Array.isArray(countries) ? countries.length : 0, 'items');
        if (countries?.length) this.featuredCountriesCache = countries;
      }),
      catchError((err) => {
        console.error('[CountryService] countries/featured/ failed:', err?.status ?? err?.message ?? err);
        return of([]);
      })
    );
  }

  /**
   * Search countries by name, code, or phone code
   */
  searchCountries(searchTerm: string): Observable<Country[]> {
    if (!searchTerm || searchTerm.length < 1) {
      return of([]);
    }
    
    return this.http.get<Country[]>(`${this.baseUrl}/countries/`, {
      params: { search: searchTerm }
    });
  }

  /**
   * Get countries grouped by continent
   */
  getCountriesByContinent(): Observable<{ [continent: string]: Country[] }> {
    return this.http.get<{ [continent: string]: Country[] }>(`${this.baseUrl}/countries/by_continent/`);
  }

  /**
   * Get countries by continent
   */
  getCountriesInContinent(continent: string): Observable<Country[]> {
    return this.http.get<Country[]>(`${this.baseUrl}/countries/`, {
      params: { continent }
    });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.countriesCache = null;
    this.featuredCountriesCache = null;
  }

  /**
   * Format phone number with country code
   */
  formatPhoneNumber(country: Country, phoneNumber: string): string {
    // Remove any existing country code or non-digits
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    return `${country.phone_code}${cleanNumber}`;
  }

  /**
   * Validate phone number length for country
   */
  validatePhoneLength(country: Country, phoneNumber: string): boolean {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const minLength = country.phone_length_min || 10;
    const maxLength = country.phone_length_max || 10;
    return cleanNumber.length >= minLength && cleanNumber.length <= maxLength;
  }

  /** Preferred UI language (used by language selector); data comes from country table. */
  getPreferredLang(): string {
    return this.preferredLang$.getValue();
  }

  getPreferredLang$(): Observable<string> {
    return this.preferredLang$.asObservable();
  }

  /** Page source language for Google Translate (site content is in English). */
  private static readonly PAGE_LANGUAGE = 'en';

  setPreferredLang(code: string, countryCode?: string): void {
    localStorage.setItem(CountryService.PREFERRED_LANG_KEY, code);
    if (countryCode != null) {
      localStorage.setItem(CountryService.PREFERRED_LANG_COUNTRY_KEY, countryCode);
    }
    this.preferredLang$.next(code);
    this.applyLanguageToDocument(code);
  }

  /**
   * Apply current language to the whole site: <html lang="..."> only.
   * Layout (dir) is left as ltr so changing country only changes language (via Google Translate), not layout.
   */
  applyLanguageToDocument(lang: string): void {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.lang = lang || 'en';
    // Do not set dir - keep default ltr so layout does not change when switching language
  }

  /**
   * Set Google Translate cookie so the widget translates the page. For best results with mixed Bengali+English
   * content, we first translate to English, then to the target language (two-step).
   * Reloads the page so the new language takes effect.
   */
  applyGoogleTranslateLang(targetLangCode: string): void {
    if (typeof document === 'undefined' || !document.cookie) return;
    const target = (targetLangCode || CountryService.PAGE_LANGUAGE).toLowerCase();
    const clearTranslation = target === CountryService.PAGE_LANGUAGE || target === CountryService.ORIGINAL_LANG;
    if (clearTranslation) {
      document.cookie = 'googtrans=; path=/; max-age=31536000';
      window.location.reload();
      return;
    }
    // Two-step: first Bengali (whole page) → English, then English → target (so all content translates)
    try {
      localStorage.setItem('translateViaEnglishTarget', target);
    } catch (_) {}
    document.cookie = 'googtrans=/bn/en; path=/; max-age=31536000';
    window.location.reload();
  }

  /** Country chosen for the current language (so flag = this country's flag). */
  getPreferredCountryForLang(): string | null {
    try {
      return localStorage.getItem(CountryService.PREFERRED_LANG_COUNTRY_KEY);
    } catch {
      return null;
    }
  }

  /** Set preferred lang from storage or infer from country (e.g. BD -> bn). Call once at app init. */
  initPreferredLangFromCountry(countryCode?: string | null): void {
    const stored = localStorage.getItem(CountryService.PREFERRED_LANG_KEY);
    if (stored) {
      this.preferredLang$.next(stored);
      this.applyLanguageToDocument(stored);
      return;
    }
    if (countryCode === 'BD') {
      this.setPreferredLang('bn', 'BD');
    } else {
      this.setPreferredLang('en', 'US');
    }
  }

  /**
   * Get phone placeholder from phone format
   */
  getPhonePlaceholder(country: Country): string {
    if (!country.phone_format) {
      return '1234567890';
    }
    // Remove country code from format and return local part
    return country.phone_format
      .replace(country.phone_code, '')
      .replace(/X/g, '0')
      .trim();
  }
}
