import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface LoadingState {
  show: boolean;
  progressPercent: number;
  total: number;
  completed: number;
  /** Custom overlay text (e.g. PDF/DOCX export). When null, header uses its default loading phrase. */
  message: string | null;
}

/**
 * Stepped fake progress (same for PDF/DOCX export and all setTotal/completeOne page loads):
 * start 10%; every 500ms: +5%→50%, +4%→60%, +3%→70%, +2%→80%, +1%→99%.
 */
const FAKE_START_PERCENT = 10;
const FAKE_CAP_PERCENT = 99;
const FAKE_TICK_MS = 500;

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private total = 0;
  private completed = 0;
  private delayingHide = false;
  private displayPercent = 0;
  private readonly state$ = new BehaviorSubject<LoadingState>(this.getState());
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private loadListener: (() => void) | null = null;
  /** Non-export overlay: same stepped tick as export (pair with {@link clearLoadProgressTimer}). */
  private loadProgressTimeout: ReturnType<typeof setTimeout> | null = null;

  /** PDF/DOCX export from question creator: timed progress + custom message (does not use setTotal/completeOne). */
  private exportMode = false;
  private exportDisplayPercent = 0;
  private exportMessage = '';
  private exportProgressTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Set expected number of API calls (resets completed to 0). Call when a page starts loading. */
  setTotal(n: number): void {
    this.clearExportProgress();
    this.clearLoadProgressTimer();
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    if (this.loadListener && typeof window !== 'undefined') {
      window.removeEventListener('load', this.loadListener);
      this.loadListener = null;
    }
    this.delayingHide = false;
    this.total = Math.max(0, n);
    this.completed = 0;
    this.displayPercent = this.total > 0 ? FAKE_START_PERCENT : 0;
    this.state$.next(this.getState());
    if (this.total > 0) {
      this.scheduleNonExportProgressTick();
    }
  }

  private clearLoadProgressTimer(): void {
    if (this.loadProgressTimeout) {
      clearTimeout(this.loadProgressTimeout);
      this.loadProgressTimeout = null;
    }
  }

  private clearExportProgress(): void {
    if (this.exportProgressTimeout) {
      clearTimeout(this.exportProgressTimeout);
      this.exportProgressTimeout = null;
    }
    this.exportMode = false;
    this.exportDisplayPercent = 0;
    this.exportMessage = '';
  }

  private fakeProgressNextPercent(p: number): number {
    if (p < 50) {
      return Math.min(50, p + 5);
    }
    if (p < 60) {
      return Math.min(60, p + 4);
    }
    if (p < 70) {
      return Math.min(70, p + 3);
    }
    if (p < 80) {
      return Math.min(80, p + 2);
    }
    return Math.min(FAKE_CAP_PERCENT, p + 1);
  }

  /** Stepped progress for normal page loads (setTotal / completeOne). */
  private scheduleNonExportProgressTick(): void {
    if (this.loadProgressTimeout) {
      clearTimeout(this.loadProgressTimeout);
      this.loadProgressTimeout = null;
    }
    if (this.exportMode) {
      return;
    }
    if (this.total <= 0) {
      return;
    }
    const showOverlay = this.delayingHide || (this.total > 0 && this.completed < this.total);
    if (!showOverlay) {
      return;
    }
    if (this.displayPercent >= FAKE_CAP_PERCENT) {
      return;
    }
    this.loadProgressTimeout = setTimeout(() => {
      this.loadProgressTimeout = null;
      if (this.exportMode || this.total <= 0) {
        return;
      }
      const show = this.delayingHide || (this.total > 0 && this.completed < this.total);
      if (!show) {
        return;
      }
      this.displayPercent = this.fakeProgressNextPercent(this.displayPercent);
      this.state$.next(this.getState());
      this.scheduleNonExportProgressTick();
    }, FAKE_TICK_MS);
  }

  private scheduleExportProgressTick(): void {
    if (this.exportProgressTimeout) {
      clearTimeout(this.exportProgressTimeout);
      this.exportProgressTimeout = null;
    }
    if (!this.exportMode) {
      return;
    }
    if (this.exportDisplayPercent >= FAKE_CAP_PERCENT) {
      return;
    }
    this.exportProgressTimeout = setTimeout(() => {
      this.exportProgressTimeout = null;
      if (!this.exportMode) {
        return;
      }
      this.exportDisplayPercent = this.fakeProgressNextPercent(this.exportDisplayPercent);
      this.state$.next(this.getState());
      this.scheduleExportProgressTick();
    }, FAKE_TICK_MS);
  }

  private hideLoader(): void {
    this.clearLoadProgressTimer();
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    if (this.loadListener && typeof window !== 'undefined') {
      window.removeEventListener('load', this.loadListener);
      this.loadListener = null;
    }
    this.displayPercent = 100;
    this.state$.next(this.getState());
    this.hideTimeout = setTimeout(() => {
      this.hideTimeout = null;
      this.delayingHide = false;
      this.state$.next(this.getState());
    }, 220);
  }

  /** Call when one API has responded (success or error). */
  completeOne(): void {
    this.completed = Math.min(this.completed + 1, this.total);
    if (this.completed >= this.total && this.total > 0) {
      this.delayingHide = true;
      this.state$.next(this.getState());
      this.scheduleNonExportProgressTick();
      this.scheduleHideWhenPageLoaded();
    } else {
      this.state$.next(this.getState());
    }
  }

  /**
   * Question creator: show export overlay with custom text; same stepped progress as page loads.
   * Clears any normal setTotal progress. Pair with {@link endPdfDocxExport}.
   */
  beginPdfDocxExport(format: 'both' | 'pdf' | 'docx', messageOverride?: string | null): void {
    this.clearExportProgress();
    this.clearLoadProgressTimer();
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    if (this.loadListener && typeof window !== 'undefined') {
      window.removeEventListener('load', this.loadListener);
      this.loadListener = null;
    }
    this.total = 0;
    this.completed = 0;
    this.delayingHide = false;

    this.exportMode = true;
    this.exportDisplayPercent = FAKE_START_PERCENT;
    this.exportMessage =
      messageOverride != null && String(messageOverride).trim()
        ? String(messageOverride).trim()
        : format === 'both'
          ? 'Exporting pdf/docx! please wait.......'
          : format === 'pdf'
            ? 'Exporting pdf! please wait.......'
            : 'Exporting docx! please wait.......';
    this.state$.next(this.getState());

    this.scheduleExportProgressTick();
  }

  /** End export overlay: jump to 100%, then hide (pair with {@link beginPdfDocxExport}). */
  endPdfDocxExport(): void {
    if (this.exportProgressTimeout) {
      clearTimeout(this.exportProgressTimeout);
      this.exportProgressTimeout = null;
    }
    if (!this.exportMode) {
      return;
    }
    this.exportDisplayPercent = 100;
    this.state$.next(this.getState());
    setTimeout(() => {
      this.exportMode = false;
      this.exportDisplayPercent = 0;
      this.exportMessage = '';
      this.state$.next(this.getState());
    }, 220);
  }

  /** Hide loader only after page load (title bar stops reloading) + short delay. */
  private scheduleHideWhenPageLoaded(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.hideTimeout = setTimeout(() => this.hideLoader(), 300);
      return;
    }
    const runHide = () => {
      if (this.loadListener && typeof window !== 'undefined') {
        window.removeEventListener('load', this.loadListener);
        this.loadListener = null;
      }
      if (this.hideTimeout) clearTimeout(this.hideTimeout);
      this.hideTimeout = setTimeout(() => this.hideLoader(), 250);
    };
    if (document.readyState === 'complete') {
      runHide();
      return;
    }
    this.loadListener = () => {
      this.loadListener = null;
      runHide();
    };
    window.addEventListener('load', this.loadListener);
    this.hideTimeout = setTimeout(() => {
      if (this.loadListener) {
        window.removeEventListener('load', this.loadListener);
        this.loadListener = null;
      }
      this.hideTimeout = null;
      runHide();
    }, 8000);
  }

  /** Observable of current loading state (show overlay and progress 0–100). */
  getState$(): Observable<LoadingState> {
    return this.state$.asObservable();
  }

  get currentState(): LoadingState {
    return this.getState();
  }

  private getState(): LoadingState {
    if (this.exportMode) {
      return {
        show: true,
        progressPercent: Math.min(100, Math.round(this.exportDisplayPercent)),
        total: 0,
        completed: 0,
        message: this.exportMessage,
      };
    }
    const total = this.total;
    const completed = this.completed;
    const show = this.delayingHide || (total > 0 && completed < total);
    const progressPercent =
      total <= 0
        ? 100
        : show
          ? Math.min(100, Math.round(this.displayPercent))
          : 100;
    return { show, progressPercent, total, completed, message: null };
  }
}
