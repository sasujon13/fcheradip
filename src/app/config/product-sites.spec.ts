import {
  CHERADIP_PRODUCT_SITES,
  productHrefForHostname,
  productRouteForHostname,
} from './product-sites';

describe('product site routing', () => {
  it('keeps legacy routes for local development', () => {
    const ai = CHERADIP_PRODUCT_SITES.find(product => product.id === 'ai')!;
    const tutor = CHERADIP_PRODUCT_SITES.find(product => product.id === 'tutor')!;
    const agent = CHERADIP_PRODUCT_SITES.find(product => product.id === 'agent')!;
    const ailt = CHERADIP_PRODUCT_SITES.find(product => product.id === 'ailt')!;
    expect(productHrefForHostname(ai, 'localhost')).toBe('/ai');
    expect(productHrefForHostname(tutor, 'localhost')).toBe('/tutor');
    expect(productHrefForHostname(agent, 'localhost')).toBe('/agent');
    expect(productHrefForHostname(ailt, 'localhost')).toBe('/ailt');
    expect(productHrefForHostname(ailt, '127.0.0.1')).toBe('/ailt');
  });

  it('uses product subdomains in production', () => {
    const agent = CHERADIP_PRODUCT_SITES.find(product => product.id === 'agent')!;
    expect(productHrefForHostname(agent, 'cheradip.com')).toBe('https://agent.cheradip.com');
    expect(productRouteForHostname('AI.CHERADIP.COM')).toBe('/ai');
    expect(productRouteForHostname('TUTOR.CHERADIP.COM')).toBe('/tutor');
    expect(productRouteForHostname('AGENT.CHERADIP.COM')).toBe('/agent');
  });

  it('keeps ecommerce as the final listing', () => {
    expect(CHERADIP_PRODUCT_SITES.at(-1)?.id).toBe('ecommerce');
  });
});
