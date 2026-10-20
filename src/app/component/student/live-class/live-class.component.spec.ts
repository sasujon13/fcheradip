import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { StudentService } from '../../../service/student.service';
import { LiveClassComponent } from './live-class.component';
import { LiveClass, nextClassTime } from '../../../service/live-class';

const lesson: LiveClass = {id: 1, title: 'Physics lesson', subject: 'Physics', level: 'HSC', topic: 'Motion', teacher_name: 'Teacher',
  description: 'Class notes', starts_at: '2026-06-11T16:20:00Z', ends_at: '2026-06-11T17:20:00Z', join_url: 'https://example.com/class', status: 'scheduled'};

describe('Live Class schedule', () => {
  it('formats the real schedule in Bangladesh time without inventing a placeholder date', () => {
    expect(nextClassTime(lesson, false, false)).toBe('11-Jun 10:20 PM');
    expect(nextClassTime(null, false, false)).toBe('Not scheduled');
    expect(nextClassTime(null, false, true)).toBe('Schedule unavailable');
    expect(nextClassTime(null, true, false)).toBe('Loading…');
  });
  it('filters classes by topic, teacher, subject and level', () => {
    const component = new LiveClassComponent({} as any);
    component.classes = [lesson];
    for (const query of ['motion', 'teacher', 'physics', 'hsc']) { component.search = query; expect(component.visibleClasses.length).toBe(1); }
    component.search = 'no match'; expect(component.visibleClasses).toEqual([]);
  });
  it('shows a useful error when the schedule cannot load', () => {
    const component = new LiveClassComponent({getLiveClasses: () => throwError(() => new Error('offline'))} as any);
    component.load(); expect(component.loading).toBeFalse(); expect(component.error).toContain('could not be loaded');
  });
  it('renders class details and a safe joining link', async () => {
    await TestBed.configureTestingModule({imports: [LiveClassComponent, RouterTestingModule], providers: [
      {provide: StudentService, useValue: {getLiveClasses: () => of({classes: [lesson], nextClass: lesson})}},
    ]}).compileComponents();
    const fixture = TestBed.createComponent(LiveClassComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('11-Jun 10:20 PM');
    const link = fixture.nativeElement.querySelector('a.join-class');
    expect(link.href).toBe(lesson.join_url); expect(link.rel).toContain('noopener');
    fixture.destroy();
  });
});
