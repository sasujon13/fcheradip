import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../service/api.service';
import { LoadingService } from '../../../service/loading.service';
import { QuestionExportFilesService } from '../../../shared/question-export-files.service';
import { CreatedQuestionsComponent } from './created-questions.component';
import { CreatedQuestionsRowLayout } from './created-questions-row-layout';

describe('saved-question responsive rows', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CreatedQuestionsComponent],
      imports: [CommonModule, FormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ApiService, useValue: {} },
        { provide: LoadingService, useValue: { setTotal() {}, completeOne() {} } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: Router, useValue: {} },
        QuestionExportFilesService,
      ],
    }).compileComponents();
  });

  for (const width of [1280, 900, 640, 390, 320]) {
    it(`keeps names to two lines and action groups intact at ${width}px`, async () => {
      const fixture = TestBed.createComponent(CreatedQuestionsComponent);
      spyOn(fixture.componentInstance, 'load');
      const name = 'Physics_Chapter_' + 'A long question set name ভৌত জগত ও পরিমাপ '.repeat(12);
      fixture.componentInstance.loading = false;
      fixture.componentInstance.sets = [{
        id: 1, name, question_header: 'A different header',
        questions: new Array(30).fill({}), created_at: '2026-10-17T12:54:00',
      }, {
        id: 2, name: 'Physics_Chapter_1', questions: [], created_at: '2026-10-17T12:54:00',
      }] as any;
      const host = fixture.nativeElement as HTMLElement;
      host.style.display = 'block';
      host.style.width = `${width}px`;
      fixture.detectChanges();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const layout = new CreatedQuestionsRowLayout(host);
      layout.refresh();

      const table = host.querySelector('.sets-table') as HTMLElement;
      const title = host.querySelector('.set-name-counter') as HTMLElement;
      const metadata = host.querySelector('.set-metadata') as HTMLElement;
      const actions = host.querySelector('.actions-inline') as HTMLElement;
      const buttons = [...actions.querySelectorAll('button')];
      const titleStyle = getComputedStyle(title);
      expect(titleStyle.webkitLineClamp).toBe('2');
      expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(titleStyle.lineHeight) * 2 + 1);
      expect(title.getAttribute('title')).toBe(name);
      expect(title.getAttribute('data-ui-note')).toBe(name);
      expect(table.scrollWidth).toBeLessThanOrEqual(table.clientWidth + 1);
      expect(buttons.length).toBe(5);
      expect(new Set(buttons.map(button => button.getBoundingClientRect().top)).size).toBe(1);
      const metaTop = metadata.getBoundingClientRect().top;
      const actionsTop = actions.getBoundingClientRect().top;
      if (width >= 900) {
        expect(Math.abs(metaTop - actionsTop)).toBeLessThan(10);
      } else if (width !== 640) {
        expect(actionsTop).toBeGreaterThan(metaTop);
      } else {
        // At this width both groups may fit below the title on a single line.
        const metaBounds = metadata.getBoundingClientRect();
        const actionBounds = actions.getBoundingClientRect();
        expect(metaBounds.right <= actionBounds.left || metaBounds.bottom <= actionBounds.top).toBeTrue();
      }
      layout.destroy();
      fixture.destroy();
    });
  }

  it('waits for the shortest name to overflow, stays stable, and rechecks renamed/filtered names', async () => {
    const fixture = TestBed.createComponent(CreatedQuestionsComponent);
    spyOn(fixture.componentInstance, 'load');
    fixture.componentInstance.loading = false;
    const longName = 'An extremely long question name '.repeat(30);
    fixture.componentInstance.sets = [
      { id: 1, name: longName, questions: [], created_at: '2026-10-17T12:54:00' },
      { id: 2, name: 'Physics', questions: [], created_at: '2026-10-17T12:54:00' },
    ] as any;
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '900px';
    host.style.minWidth = '900px';
    fixture.detectChanges();
    const layout = new CreatedQuestionsRowLayout(host);
    layout.refresh();
    const wrap = host.querySelector('.sets-table-wrap')!;
    expect(wrap.classList.contains('sets-table-wrap--compact')).toBeFalse();
    host.style.width = host.style.minWidth = '600px';
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    expect(wrap.classList.contains('sets-table-wrap--compact')).toBeTrue();
    host.style.width = host.style.minWidth = '900px';
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    expect(wrap.classList.contains('sets-table-wrap--compact')).toBeFalse();
    fixture.componentInstance.sets[1].name = longName;
    fixture.detectChanges();
    layout.refresh();
    expect(wrap.classList.contains('sets-table-wrap--compact')).toBeTrue();
    layout.refresh();
    expect(wrap.classList.contains('sets-table-wrap--compact')).toBeTrue();
    fixture.componentInstance.sets = [{ id: 3, name: 'Physics', questions: [] }] as any;
    fixture.detectChanges();
    layout.refresh();
    expect(host.querySelector('.sets-table-wrap')!.classList.contains('sets-table-wrap--compact')).toBeFalse();
    layout.destroy();
    fixture.destroy();
  });
});
