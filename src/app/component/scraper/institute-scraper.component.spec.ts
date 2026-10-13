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
});
