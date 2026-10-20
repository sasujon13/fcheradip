import { of, Subject } from 'rxjs';
import { HeaderComponent } from './header.component';
import { accountSessionKey } from '../../service/account-session-state';

describe('header account records', () => {
  const keys = ['authToken', 'username', 'isLoggedIn', 'cheradipEcommerceCart', 'cheradipEcommerceCartOwner'];
  let previous: (string | null)[];
  beforeEach(() => {
    previous = keys.map(key => localStorage.getItem(key));
    keys.forEach(key => localStorage.removeItem(key));
  });
  afterEach(() => keys.forEach((key, i) => previous[i] == null
    ? localStorage.removeItem(key) : localStorage.setItem(key, previous[i]!)));
  const signIn = (name: string) => {
    localStorage.setItem('authToken', `token-${name}`);
    localStorage.setItem('username', name);
    localStorage.setItem('isLoggedIn', 'true');
  };
  const fixture = () => {
    const statusA = new Subject<any>(); const statusB = new Subject<any>();
    const cartA = new Subject<any>(); const cartB = new Subject<any>();
    const commerceA = new Subject<any>(); const commerceB = new Subject<any>();
    const wallet = {fetchCoinBalance: jasmine.createSpy().and.returnValue(of(100)), clearCachedBalance: jasmine.createSpy(), setCachedRemaining: jasmine.createSpy()};
    const header = new HeaderComponent({getPackageStatus: jasmine.createSpy().and.returnValues(statusA, statusB),
      scraperAccess: () => of({allowed: false}), commerceAccess: jasmine.createSpy().and.returnValues(commerceA, commerceB)} as any, {url: '/index'} as any, null as any, null as any,
      null as any, {get: jasmine.createSpy().and.returnValues(cartA, cartB)} as any,
      {markForCheck: () => {}} as any, wallet as any,
      {hasStoredSession: () => !!accountSessionKey()} as any, null as any);
    return {header, wallet, statusA, statusB, cartA, cartB, commerceA, commerceB};
  };

  it('loads wallet, package, badge, picture, reference balance and cart on a login event', () => {
    signIn('a');
    const f = fixture(); f.header.onSessionChanged();
    expect(f.wallet.fetchCoinBalance).toHaveBeenCalled();
    f.statusA.next({badge: 'Gold', profileImageUrl: '/picture.png', wallet: {availableTaka: 150}});
    f.cartA.next({token: 'cart-a', count: 3});
    expect(f.header.profileBadge).toBe('Gold');
    expect(f.header.profileImageUrl).toBe('/picture.png');
    expect(f.header.headerReferenceBalance).toBe(150);
    expect(f.header.totalCartItem).toBe(3);
  });

  it('does not show previous account records after switching accounts', () => {
    signIn('a'); const f = fixture(); f.header.onSessionChanged();
    signIn('b'); f.header.onSessionChanged();
    f.statusB.next({badge: 'Silver', wallet: {availableTaka: 20}});
    f.cartB.next({token: 'cart-b', count: 2});
    f.statusA.next({badge: 'Gold', wallet: {availableTaka: 999}});
    f.cartA.next({token: 'cart-a', count: 99});
    expect(f.header.profileBadge).toBe('Silver');
    expect(f.header.headerReferenceBalance).toBe(20);
    expect(f.header.totalCartItem).toBe(2);
    expect(localStorage.getItem('cheradipEcommerceCart')).toBe('cart-b');
  });

  it('does not let a delayed cart read undo a newer Add to cart event', () => {
    signIn('a'); const f = fixture(); f.header.onSessionChanged();
    f.header.updateCommerceCartCount(new CustomEvent('cheradip-ecommerce-cart-count', {detail: 4}));
    f.cartA.next({token: 'cart-a', count: 0});
    expect(f.header.totalCartItem).toBe(4);
  });

  it('does not keep the Manage menu after switching away from a staff account', () => {
    signIn('staff'); const f = fixture(); f.header.onSessionChanged();
    f.commerceA.next({allowed: true});
    expect(f.header.commerceStaff).toBeTrue();
    signIn('regular'); f.header.onSessionChanged();
    expect(f.header.commerceStaff).toBeFalse();
    f.commerceB.next({allowed: false});
    f.commerceA.next({allowed: true});
    expect(f.header.commerceStaff).toBeFalse();
  });

  it('updates shopping balance immediately and ignores another account wallet event', () => {
    signIn('a'); const f = fixture();
    f.header.updateWalletFromPurchase(new CustomEvent('cheradip-wallet-updated', {detail: {owner: 'a', coins: 91300, referenceTaka: 0}}));
    expect(f.wallet.setCachedRemaining).toHaveBeenCalledWith(91300);
    expect(f.header.headerReferenceBalance).toBe(0);
    f.header.updateWalletFromPurchase(new CustomEvent('cheradip-wallet-updated', {detail: {owner: 'b', coins: 1, referenceTaka: 999}}));
    expect(f.wallet.setCachedRemaining).toHaveBeenCalledTimes(1);
  });
});
