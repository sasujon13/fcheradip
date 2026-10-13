import { fakeAsync, tick } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { Subject } from 'rxjs';
import { TrxHelpVisibility } from './trx-help-visibility';
import { NtrcaHeaderSectionComponent } from './ntrca-header-section/ntrca-header-section.component';

describe('Payment help timed and outside-click dismissal', () => {
  it('auto-closes after click-to-open without needing a pointerleave', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    help.toggle();
    tick(14999);
    expect(help.phase).toBe('on');
    tick(1);
    expect(help.phase).toBe('closing');
    tick(300);
    expect(help.phase).toBe('off');
  }));

  it('stays open while hovered, then closes 15 seconds after leaving', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    help.show();
    tick(10000);
    help.enterBox();
    tick(30000);
    expect(help.phase).toBe('on');
    help.leaveBox();
    tick(14999);
    expect(help.phase).toBe('on');
    tick(1);
    expect(help.phase).toBe('closing');
    tick(300);
    expect(help.phase).toBe('off');
  }));

  it('closes immediately on an outside click and cancels the timeout', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    help.show();
    tick(14000);
    help.enterBox();
    help.documentClick(document.createElement('button'), document.createElement('div'));
    expect(help.phase).toBe('off');
    tick(16000);
    expect(help.phase).toBe('off');
  }));

  it('keeps the box open across repeated hover entries and inside clicks', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    const container = document.createElement('div');
    const link = document.createElement('a');
    container.appendChild(link);
    help.show();
    tick(10000);
    help.enterBox();
    help.show();
    help.documentClick(link, container);
    tick(30000);
    expect(help.phase).toBe('on');
    help.leaveBox();
    tick(15300);
    expect(help.phase).toBe('off');
  }));

  it('closes immediately when clicked outside during the automatic fade', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    help.show(); tick(15000);
    help.documentClick(document.body);
    expect(help.phase).toBe('off');
    tick(300);
    expect(help.phase).toBe('off');
  }));

  it('does not dismiss on the click that opens or toggles help from a Buy button', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    const trigger = document.createElement('button');
    trigger.setAttribute('data-trx-help-trigger', '');
    const icon = document.createElement('i'); trigger.appendChild(icon);
    help.show();
    help.documentClick(icon);
    expect(help.phase).toBe('on');
    help.toggle();
    expect(help.phase).toBe('off');
    help.toggle();
    tick(15300);
    expect(help.phase).toBe('off');
  }));

  it('cancels the old fade when re-entering during closing', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    help.show();
    tick(15000);
    help.enterBox();
    tick(1000);
    expect(help.phase).toBe('on');
    help.destroy();
  }));

  it('supports click-to-close and clears timers on destruction', fakeAsync(() => {
    const changed = jasmine.createSpy('changed');
    const help = new TrxHelpVisibility(changed);
    help.toggle();
    help.toggle();
    tick(16000);
    expect(help.phase).toBe('off');
    help.show();
    help.destroy();
    changed.calls.reset();
    tick(16000);
    expect(changed).not.toHaveBeenCalled();
  }));

  it('captures outside clicks even when the clicked control stops propagation', fakeAsync(() => {
    const component = new NtrcaHeaderSectionComponent({ events: new Subject() } as any, { markForCheck: () => {} } as any);
    const container = document.createElement('div');
    const inside = document.createElement('button'); container.appendChild(inside);
    const outside = document.createElement('button');
    outside.addEventListener('click', event => event.stopPropagation());
    document.body.append(container, outside);
    component.trxHelpContainer = new ElementRef(container);
    component.ngOnInit();
    try {
      component.trxHelp.show();
      inside.click();
      expect(component.trxHelp.phase).toBe('on');
      outside.click();
      expect(component.trxHelp.phase).toBe('off');
    } finally {
      component.ngOnDestroy(); container.remove(); outside.remove();
    }
    tick(16000);
  }));
});
