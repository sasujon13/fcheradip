import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  it('suppresses exactly one destination loader after login', () => {
    const service = new LoadingService();

    service.setTotal(1);
    expect(service.currentState.show).toBeTrue();

    service.suppressNextPageLoadAfterLogin();
    expect(service.currentState.show).toBeFalse();

    service.setTotal(1);
    expect(service.currentState.show).toBeFalse();

    service.setTotal(1);
    expect(service.currentState.show).toBeTrue();

    service.dismissPageLoadOverlay();
  });
});
