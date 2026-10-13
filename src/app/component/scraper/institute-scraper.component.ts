import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService, InstituteScrapeResult } from '../../service/api.service';

@Component({
  selector: 'app-institute-scraper',
  templateUrl: './institute-scraper.component.html',
  styleUrls: ['./institute-scraper.component.css'],
  standalone: false,
})
export class InstituteScraperComponent implements OnInit, OnDestroy {
  page = 1;
  size = 10;
  pagesThisRun = 10;
  enrichEmis = true;
  targetEiin = '';
  targetLoading = false;
  running = false;
  loadingPreview = false;
  stopRequested = false;
  completedPages = 0;
  result: InstituteScrapeResult | null = null;
  previewResult: InstituteScrapeResult | null = null;
  error = '';
  message = '';
  logs: string[] = [];
  status: { localInstitutes: number; lastPage: number | null; lastSize: number | null; sourceTotal: number | null; lastProcessedAt: string | null } | null = null;
  private readonly destroyed = new Subject<void>();

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.refreshStatus();
  }

  ngOnDestroy(): void {
    this.stopRequested = true;
    this.destroyed.next();
    this.destroyed.complete();
  }

  refreshStatus(): void {
    this.api.instituteScrapeStatus().pipe(takeUntil(this.destroyed)).subscribe({
      next: value => {
        this.status = value;
        if (value.lastPage && value.lastSize === this.size && this.page === 1) {
          this.page = value.lastPage + 1;
        }
      },
      error: () => { this.message = 'Could not load the last completed page.'; },
    });
  }

  preview(): void {
    if (this.running || this.loadingPreview || this.targetLoading) return;
    this.error = '';
    this.previewResult = null;
    this.loadingPreview = true;
    this.api.instituteScrapePage({ page: this.page, size: this.size, mode: 'preview', enrichEmis: this.enrichEmis })
      .pipe(takeUntil(this.destroyed)).subscribe({
        next: value => { this.previewResult = value; this.loadingPreview = false; },
        error: err => { this.error = err?.error?.detail || 'Source preview failed.'; this.loadingPreview = false; },
      });
  }

  start(): void {
    if (this.running || this.targetLoading) return;
    if (!Number.isInteger(this.page) || this.page < 1 || !Number.isInteger(this.size) || this.size < 1 || this.size > 25 ||
        !Number.isInteger(this.pagesThisRun) || this.pagesThisRun < 1 || this.pagesThisRun > 100) {
      this.error = 'Choose a positive start page, 1–25 records per page, and 1–100 pages for this run.';
      return;
    }
    this.running = true;
    this.stopRequested = false;
    this.completedPages = 0;
    this.error = '';
    this.message = 'Importing one page at a time. You can stop after the current page.';
    this.runNextPage();
  }

  stop(): void {
    this.stopRequested = true;
    this.message = 'Stopping after the current page…';
  }

  updateOne(mode: 'preview' | 'apply'): void {
    if (this.running || this.loadingPreview || this.targetLoading) return;
    const eiin = this.targetEiin.trim();
    if (!/^\d{6}$/.test(eiin)) {
      this.error = 'Enter a six-digit EIIN.';
      return;
    }
    this.error = '';
    this.previewResult = null;
    this.result = null;
    this.targetLoading = true;
    this.api.instituteScrapePage({ page: 1, size: 1, mode, enrichEmis: this.enrichEmis, eiin })
      .pipe(takeUntil(this.destroyed)).subscribe({
        next: value => {
          if (mode === 'preview') this.previewResult = value;
          else this.result = value;
          this.targetLoading = false;
          this.message = mode === 'preview' ? `Previewed ${eiin}; nothing was saved.` :
            value.failed ? `Could not update ${eiin}. Review the result below.` : `Updated ${eiin}.`;
          if (mode === 'apply' && !value.failed) this.refreshStatus();
        },
        error: err => {
          this.error = err?.error?.detail || `Could not ${mode === 'preview' ? 'preview' : 'update'} ${eiin}.`;
          this.targetLoading = false;
        },
      });
  }

  private runNextPage(): void {
    if (this.stopRequested || this.completedPages >= this.pagesThisRun ||
        (this.status?.sourceTotal && (this.page - 1) * this.size >= this.status.sourceTotal)) {
      this.running = false;
      this.message = this.stopRequested ? `Stopped. Resume at page ${this.page}.` : `Run complete. Next page: ${this.page}.`;
      this.refreshStatus();
      return;
    }
    this.api.instituteScrapePage({ page: this.page, size: this.size, mode: 'apply', enrichEmis: this.enrichEmis })
      .pipe(takeUntil(this.destroyed)).subscribe({
        next: value => {
          this.result = value;
          this.completedPages += 1;
          this.status = { ...this.status, localInstitutes: (this.status?.localInstitutes || 0) + value.created,
            sourceTotal: value.sourceTotal, lastPage: value.failed ? this.status?.lastPage ?? null : value.page,
            lastSize: value.size, lastProcessedAt: new Date().toISOString() };
          this.logs = [`Page ${value.page}: ${value.created} new, ${value.updated} updated, ${value.unchanged} unchanged, ` +
            `${value.failed} failed; teachers ${value.teachersCreated || 0} new, ${value.teachersUpdated || 0} updated, ` +
            `${value.teachersUnlisted || 0} no longer listed; ${value.emisSkipped} EMIS lookups unavailable.`, ...this.logs].slice(0, 80);
          if (value.failed) {
            this.running = false;
            this.error = `Page ${value.page} has failed records. Review them below and retry the same page.`;
            return;
          }
          this.page = value.nextPage;
          this.runNextPage();
        },
        error: err => {
          this.running = false;
          this.error = err?.error?.detail || `Page ${this.page} failed. Retry this page when the source is available.`;
        },
      });
  }

  get progress(): number {
    return this.pagesThisRun ? Math.min(100, (this.completedPages / this.pagesThisRun) * 100) : 0;
  }
}
