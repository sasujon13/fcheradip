import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  PagedFetchResult,
  PagedWindowCache,
  syncPagedWindowCache,
} from './paged-window-cache';

/** NTRCA list pages: 100 per page, up to 3 pages (300 rows) in memory. */
export const NTRCA_PAGE_SIZE = 100;
export const NTRCA_WINDOW_MAX_PAGES = 3;

export function createNtrcaPagedCache<T = any>(): PagedWindowCache<T> {
  return new PagedWindowCache<T>(NTRCA_PAGE_SIZE, NTRCA_WINDOW_MAX_PAGES);
}

export interface NtrcaVacancyStyleFetch {
  http: HttpClient;
  baseUrl: string;
  page: number;
  buildParams: (page: number) => HttpParams;
}

/** Fetch one page for vacant/ntrca-style vacancy APIs ({ results, count }). */
export function fetchNtrcaVacancyPage(
  opts: NtrcaVacancyStyleFetch
): Observable<PagedFetchResult<any>> {
  const params = opts.buildParams(opts.page);
  return opts.http.get<{ results?: any[]; count?: number }>(opts.baseUrl, { params }).pipe(
    map((data) => ({
      items: data?.results ?? [],
      totalCount: data?.count ?? 0,
    }))
  );
}

export interface SyncNtrcaWindowOptions {
  cache: PagedWindowCache<any>;
  /** Mutable: previous filter/search key for this component instance. */
  cacheKeyRef: { value: string };
  getCacheKey: () => string;
  currentPage: number;
  http: HttpClient;
  baseUrl: string;
  buildParams: (page: number) => HttpParams;
  onCurrentPage: (items: any[]) => void;
  onMeta: (meta: { totalCount: number; totalPages: number }) => void;
  onLoading: (loading: boolean) => void;
  /** Called when cache key changes (new search); clear UI totals if needed. */
  onCacheReset?: () => void;
}

/**
 * Sync NTRCA vacancy list with a 3-page sliding window (max 300 items).
 * Call from getVacancies(page) after setting currentPage.
 */
export function syncNtrcaVacancyWindow(opts: SyncNtrcaWindowOptions): void {
  const key = opts.getCacheKey();
  if (key !== opts.cacheKeyRef.value) {
    opts.cache.clear();
    opts.cacheKeyRef.value = key;
    opts.onCacheReset?.();
  }

  syncPagedWindowCache({
    cache: opts.cache,
    currentPage: opts.currentPage,
    fetchPage: (p) =>
      fetchNtrcaVacancyPage({
        http: opts.http,
        baseUrl: opts.baseUrl,
        page: p,
        buildParams: opts.buildParams,
      }),
    onDisplay: (items) => opts.onCurrentPage(items),
    onMeta: (meta) => opts.onMeta(meta),
    onLoading: (loading) => opts.onLoading(loading),
  });
}

export interface NtrcaVacantStyleWindowOpts {
  cache: PagedWindowCache<any>;
  cacheKeyRef: { value: string };
  currentPage: number;
  http: HttpClient;
  baseUrl: string;
  designation: string;
  subject: string;
  districts: string[];
  onCurrentPage: (items: any[]) => void;
  onMeta: (meta: { totalCount: number; totalPages: number }) => void;
  onLoading: (loading: boolean) => void;
  onEmptySelection?: () => void;
}

/** Vacant / ntrca vacancy list (designation + subject + districts). */
export function syncNtrcaVacantStyleWindow(opts: NtrcaVacantStyleWindowOpts): void {
  if (!opts.subject || !opts.designation || !opts.districts.length) {
    opts.cache.clear();
    opts.cacheKeyRef.value = '';
    opts.onEmptySelection?.();
    return;
  }
  syncNtrcaVacancyWindow({
    cache: opts.cache,
    cacheKeyRef: opts.cacheKeyRef,
    getCacheKey: () =>
      JSON.stringify({
        d: opts.designation,
        s: opts.subject,
        districts: [...opts.districts].sort(),
      }),
    currentPage: opts.currentPage,
    http: opts.http,
    baseUrl: opts.baseUrl,
    buildParams: (p) => {
      let params = new HttpParams()
        .set('designation', opts.designation)
        .set('subject', opts.subject)
        .set('page', String(p));
      opts.districts.forEach((district) => {
        params = params.append('district', district);
      });
      return params;
    },
    onCurrentPage: opts.onCurrentPage,
    onMeta: opts.onMeta,
    onLoading: opts.onLoading,
  });
}

export interface NtrcaMeritStyleWindowOpts {
  cache: PagedWindowCache<any>;
  cacheKeyRef: { value: string };
  currentPage: number;
  http: HttpClient;
  baseUrl: string;
  code: string;
  onCurrentPage: (items: any[]) => void;
  onMeta: (meta: { totalCount: number; totalPages: number }) => void;
  onLoading: (loading: boolean) => void;
  onEmpty?: () => void;
}

/** Merit / banbeis list (code only). */
export function syncNtrcaMeritStyleWindow(opts: NtrcaMeritStyleWindowOpts): void {
  syncNtrcaVacancyWindow({
    cache: opts.cache,
    cacheKeyRef: opts.cacheKeyRef,
    getCacheKey: () => JSON.stringify({ code: opts.code }),
    currentPage: opts.currentPage,
    http: opts.http,
    baseUrl: opts.baseUrl,
    buildParams: (p) =>
      new HttpParams().set('code', opts.code).set('page', String(p)),
    onCurrentPage: opts.onCurrentPage,
    onMeta: opts.onMeta,
    onLoading: opts.onLoading,
    onCacheReset: opts.onEmpty,
  });
}

export interface NtrcaRecommendStyleWindowOpts {
  cache: PagedWindowCache<any>;
  cacheKeyRef: { value: string };
  currentPage: number;
  http: HttpClient;
  baseUrl: string;
  code: string | number;
  districts: string[];
  thanas: string[];
  onCurrentPage: (items: any[]) => void;
  onMeta: (meta: { totalCount: number; totalPages: number }) => void;
  onLoading: (loading: boolean) => void;
}

/** Recommend list (code + districts + thanas). */
export function syncNtrcaRecommendStyleWindow(opts: NtrcaRecommendStyleWindowOpts): void {
  syncNtrcaVacancyWindow({
    cache: opts.cache,
    cacheKeyRef: opts.cacheKeyRef,
    getCacheKey: () =>
      JSON.stringify({
        code: opts.code,
        districts: [...opts.districts].sort(),
        thanas: [...opts.thanas].sort(),
      }),
    currentPage: opts.currentPage,
    http: opts.http,
    baseUrl: opts.baseUrl,
    buildParams: (p) => {
      let params = new HttpParams()
        .set('code', String(opts.code))
        .set('page', String(p));
      opts.districts.forEach((d) => {
        params = params.append('district', d);
      });
      opts.thanas.forEach((t) => {
        params = params.append('thana', t);
      });
      return params;
    },
    onCurrentPage: opts.onCurrentPage,
    onMeta: opts.onMeta,
    onLoading: opts.onLoading,
  });
}

export function sortVacanciesByDistrictThana(items: any[]): any[] {
  return [...items].sort((a, b) => {
    const distA = (a.District || '').toUpperCase();
    const distB = (b.District || '').toUpperCase();
    const cmp = distA.localeCompare(distB);
    if (cmp !== 0) return cmp;
    const thanaA = (a.Thana || '').toUpperCase();
    const thanaB = (b.Thana || '').toUpperCase();
    return thanaA.localeCompare(thanaB);
  });
}

export function sortVacanciesBySl(items: any[]): any[] {
  return [...items].sort((a, b) => {
    const slA = typeof a.SL === 'number' ? a.SL : Number(a.SL);
    const slB = typeof b.SL === 'number' ? b.SL : Number(b.SL);
    return slA - slB;
  });
}
