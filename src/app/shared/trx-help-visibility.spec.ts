import { fakeAsync, tick } from '@angular/core/testing';
import { TrxHelpVisibility } from './trx-help-visibility';

describe('Payment help idle dismissal', () => {
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

  it('keeps open while the pointer is on the actual box', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    help.show();
    tick(10000);
    help.enterBox();
    tick(30000);
    expect(help.phase).toBe('on');
    help.leaveBox();
    tick(14999);
    expect(help.phase).toBe('on');
    tick(301);
    expect(help.phase).toBe('off');
  }));

  it('resets the idle period when the user clicks anywhere', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    help.show();
    tick(14000);
    help.interact();
    tick(14000);
    expect(help.phase).toBe('on');
    tick(1300);
    expect(help.phase).toBe('off');
  }));

  it('does not lose the timeout when moving between trigger and box', fakeAsync(() => {
    const help = new TrxHelpVisibility(() => {});
    help.show();
    help.enterBox();
    help.leaveTrigger();
    tick(20000);
    expect(help.phase).toBe('on');
    help.leaveBox();
    help.leaveTrigger();
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
});
