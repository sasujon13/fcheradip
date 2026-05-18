import { forkJoin, Observable, of, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/** 1-based page numbers in the sliding window (prev, current, next). */
export function slidingWindowPageNumbers(
  currentPage: number,
  totalPages: number,
  maxPages = 3
): number[] {
  const p = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
  const pages: number[] = [p];
  if (p > 1) {
    pages.unshift(p - 1);
  }
  if (p < totalPages) {
    pages.push(p + 1);
  }
  return pages.slice(0, maxPages);
}

export interface PagedFetchResult<T> {
  items: T[];
  totalCount: number;
}

/**
 * In-memory cache for paginated API lists: keeps at most {@link maxPages} pages
 * (current ± 1). Older pages are dropped when the window moves.
 */
export class PagedWindowCache<T> {
  private readonly byPage = new Map<number, T[]>();

  constructor(
    public readonly pageSize: number,
    public readonly maxPages = 3
  ) {}

  get maxItems(): number {
    return this.pageSize * this.maxPages;
  }

  totalCount = 0;

  clear(): void {
    this.byPage.clear();
    this.totalCount = 0;
  }

  has(page: number): boolean {
    return this.byPage.has(page);
  }

  get(page: number): T[] | undefined {
    return this.byPage.get(page);
  }

  set(page: number, items: T[], totalCount?: number): void {
    this.byPage.set(page, items);
    if (totalCount != null) {
      this.totalCount = totalCount;
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  /** Remove cached pages outside the window around currentPage. */
  pruneWindow(currentPage: number, totalPages?: number): void {
    const total = totalPages ?? this.totalPages;
    const keep = new Set(slidingWindowPageNumbers(currentPage, total, this.maxPages));
    for (const p of Array.from(this.byPage.keys())) {
      if (!keep.has(p)) {
        this.byPage.delete(p);
      }
    }
  }

  /** Pages in the window that are not yet cached. */
  missingInWindow(currentPage: number, totalPages?: number): number[] {
    const total = totalPages ?? Math.max(this.totalPages, currentPage);
    return slidingWindowPageNumbers(currentPage, total, this.maxPages).filter(
      (p) => !this.has(p)
    );
  }
}

export interface SyncPagedWindowOptions<T> {
  cache: PagedWindowCache<T>;
  currentPage: number;
  fetchPage: (page: number) => Observable<PagedFetchResult<T>>;
  onDisplay: (items: T[], page: number) => void;
  onMeta?: (meta: { totalCount: number; totalPages: number }) => void;
  onLoading?: (loading: boolean) => void;
}

/**
 * Show current page from cache when possible; fetch missing window pages in the background.
 * Drops pages outside current ± 1 so at most pageSize × 3 items stay in memory.
 */
export function syncPagedWindowCache<T>(options: SyncPagedWindowOptions<T>): Subscription {
  const { cache, currentPage, fetchPage, onDisplay, onMeta, onLoading } = options;

  const showCurrent = (): void => {
    const items = cache.get(currentPage) ?? [];
    onDisplay(items, currentPage);
    onMeta?.({ totalCount: cache.totalCount, totalPages: cache.totalPages });
  };

  const prefetch = (anchorPage: number): void => {
    const totalPages = Math.max(cache.totalPages, anchorPage);
    cache.pruneWindow(anchorPage, totalPages);
    const missing = cache.missingInWindow(anchorPage, totalPages);
    if (!missing.length) {
      return;
    }
    forkJoin(
      missing.map((p) =>
        fetchPage(p).pipe(
          catchError(() => of({ items: [] as T[], totalCount: cache.totalCount }))
        )
      )
    ).subscribe((results) => {
      missing.forEach((p, i) => {
        const res = results[i];
        if (res) {
          cache.set(p, res.items, res.totalCount);
        }
      });
      cache.pruneWindow(anchorPage, cache.totalPages);
    });
  };

  if (cache.has(currentPage)) {
    showCurrent();
    onLoading?.(false);
    prefetch(currentPage);
    return new Subscription();
  }

  onLoading?.(true);
  return fetchPage(currentPage)
    .pipe(
      catchError(() => of({ items: [] as T[], totalCount: 0 }))
    )
    .subscribe({
      next: (res) => {
        cache.set(currentPage, res.items, res.totalCount);
        cache.pruneWindow(currentPage, cache.totalPages);
        showCurrent();
        onLoading?.(false);
        prefetch(currentPage);
      },
      error: () => {
        cache.set(currentPage, [], 0);
        showCurrent();
        onLoading?.(false);
      },
    });
}
