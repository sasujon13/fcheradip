import { HeaderComponent } from './header.component';

describe('Cart entry-point menubar', () => {
  const headerAt = (url: string) => new HeaderComponent(
    null as any, { url } as any, null as any, null as any, null as any,
    null as any, null as any, null as any, null as any, null as any,
  );

  it('uses the Cheradip menu for a directly opened cart', () => {
    expect(headerAt('/cart').isCommerceRoute).toBeFalse();
  });

  it('keeps the marketplace menu for a cart opened from ecommerce, including refresh', () => {
    expect(headerAt('/cart?from=ecommerce').isCommerceRoute).toBeTrue();
    expect(headerAt('/cart/?from=ECOMMERCE').isCommerceRoute).toBeTrue();
  });

  it('keeps the regular menu for other cart entry points', () => {
    expect(headerAt('/cart?from=books').isCommerceRoute).toBeFalse();
    expect(headerAt('/cart?from=cheradip').isCommerceRoute).toBeFalse();
    expect(headerAt('/cart?view=cart').isCommerceRoute).toBeFalse();
  });

  it('does not change marketplace or purchase-history menu behavior', () => {
    expect(headerAt('/ecommerce').isCommerceRoute).toBeTrue();
    expect(headerAt('/ecommerce?view=cart').isCommerceRoute).toBeTrue();
    expect(headerAt('/history?from=ecommerce').isCommerceRoute).toBeTrue();
    expect(headerAt('/history').isCommerceRoute).toBeFalse();
    expect(headerAt('/books').isCommerceRoute).toBeFalse();
  });
});
