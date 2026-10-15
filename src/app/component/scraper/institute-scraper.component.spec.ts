import { of } from 'rxjs';
import { InstituteScraperComponent } from './institute-scraper.component';
import { InstituteScrapeResult } from '../../service/api.service';

describe('InstituteScraperComponent', () => {
  const response = (page: number, failed = 0): InstituteScrapeResult => ({
    page, size: 10, sourceTotal: 100, created: failed ? 0 : 1, updated: 0,
    unchanged: 0, failed, emisSkipped: 0, nextPage: failed ? page : page + 1,
    applied: true, records: failed ? [{ eiin: '100001', status: 'failed' }] : [],
  });

  it('advances only after a successful page and keeps a failed page for retry', () => {
    const api = {
      instituteScrapeStatus: () => of({ localInstitutes: 1, lastPage: null, lastSize: null, sourceTotal: null, lastProcessedAt: null }),
      instituteAutomaticStatus: () => of({ run: null }),
      instituteScrapePage: jasmine.createSpy('page').and.callFake(({ page }: { page: number }) => of(response(page, page === 2 ? 1 : 0))),
    };
    const component = new InstituteScraperComponent(api as any);
    component.ngOnInit();
    component.pagesThisRun = 3;
    component.start();
    expect(api.instituteScrapePage).toHaveBeenCalledTimes(2);
    expect(component.page).toBe(2);
    expect(component.running).toBeFalse();
    expect(component.error).toContain('retry the same page');
    component.ngOnDestroy();
  });

  it('preview does not start an import', () => {
    const api = {
      instituteScrapeStatus: () => of({ localInstitutes: 1, lastPage: null, lastSize: null, sourceTotal: null, lastProcessedAt: null }),
      instituteAutomaticStatus: () => of({ run: null }),
      instituteScrapePage: jasmine.createSpy('preview').and.returnValue(of({ ...response(1), applied: false })),
    };
    const component = new InstituteScraperComponent(api as any);
    component.ngOnInit();
    component.preview();
    expect(api.instituteScrapePage).toHaveBeenCalledWith(jasmine.objectContaining({ mode: 'preview' }));
    expect(component.previewResult?.applied).toBeFalse();
    expect(component.running).toBeFalse();
    component.ngOnDestroy();
  });

  it('automatically processes local EIINs and leaves a separate failure count', () => {
    const run = { runId: 'run-1', status: 'running', total: 3, processed: 0, completed: 0,
      failed: 0, cursor: '', startedAt: '', completedAt: null, logDirectory: 'logs',
      completedLogUrl: '', failedLogUrl: '' } as const;
    const finished = { ...run, status: 'complete', processed: 3, completed: 2, failed: 1,
      cursor: '100003' } as const;
    const api = {
      instituteScrapeStatus: () => of({ localInstitutes: 3, lastPage: null, lastSize: null, sourceTotal: null, lastProcessedAt: null }),
      instituteAutomaticStatus: () => of({ run: null }),
      instituteAutomaticStart: jasmine.createSpy('start').and.returnValue(of({ run, mode: 'all', selected: 3 })),
      instituteAutomaticStep: jasmine.createSpy('step').and.returnValue(of({ run: finished, hasMore: false,
        nextAfter: '100003', records: [{ eiin: '100001', status: 'completed', outcome: 'unchanged', detail: '' },
          { eiin: '100002', status: 'failed', outcome: '', detail: 'Banbeis unavailable' }] })),
    };
    const component = new InstituteScraperComponent(api as any);
    component.ngOnInit();
    component.startAutomatic('all');
    expect(api.instituteAutomaticStart).toHaveBeenCalledWith('all');
    expect(api.instituteAutomaticStep).toHaveBeenCalledWith(jasmine.objectContaining({ runId: 'run-1', mode: 'all' }));
    expect(component.automaticRun?.failed).toBe(1);
    expect(component.automaticProgress).toBe(100);
    expect(component.automaticRunning).toBeFalse();
    component.ngOnDestroy();
  });
});
