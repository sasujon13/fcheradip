import { productImageMagnifier } from './product-image-magnifier';

describe('Product image magnifier', () => {
  const square = { width: 240, height: 240, naturalWidth: 600, naturalHeight: 600 };
  it('magnifies the exact point under the cursor four times', () => {
    const result = productImageMagnifier(square, 120, 120)!;
    expect(result.diameter).toBe(192);
    expect(result.left).toBe(24);
    expect(result.top).toBe(24);
    expect(result.backgroundWidth).toBe(960);
    expect(result.backgroundX).toBe(-384);
    expect(result.backgroundY).toBe(-384);
  });
  it('keeps the lens within image bounds at every edge', () => {
    expect(productImageMagnifier(square, 0, 0)!.left).toBe(0);
    expect(productImageMagnifier(square, 240, 240)!.left).toBe(48);
    expect(productImageMagnifier(square, 240, 240)!.top).toBe(48);
  });
  it('preserves landscape proportions and excludes empty letterboxing', () => {
    const landscape = { ...square, naturalHeight: 300 };
    expect(productImageMagnifier(landscape, 120, 30)).toBeNull();
    const result = productImageMagnifier(landscape, 120, 120)!;
    expect(result.backgroundHeight).toBe(480);
    expect(result.backgroundY).toBe(-144);
  });
  it('preserves portrait proportions and excludes empty side space', () => {
    const portrait = { ...square, naturalWidth: 300 };
    expect(productImageMagnifier(portrait, 30, 120)).toBeNull();
    expect(productImageMagnifier(portrait, 120, 120)!.backgroundWidth).toBe(480);
  });
  it('shrinks the lens to fit very small images', () => {
    const result = productImageMagnifier({ ...square, width: 80, height: 80 }, 40, 40)!;
    expect(result.diameter).toBe(64);
    expect(result.left).toBe(8);
  });
  it('uses 80 percent of the listing width, including image padding', () => {
    const result = productImageMagnifier({ ...square, width: 196, height: 196 }, 98, 98, 224)!;
    expect(result.diameter).toBeCloseTo(179.2, 5);
    expect(result.backgroundWidth).toBe(784);
  });
  it('does not magnify broken, unloaded or out-of-bounds images', () => {
    expect(productImageMagnifier({ ...square, naturalWidth: 0 }, 120, 120)).toBeNull();
    expect(productImageMagnifier(square, -1, 100)).toBeNull();
    expect(productImageMagnifier(square, 100, 241)).toBeNull();
    expect(productImageMagnifier(square, NaN, 100)).toBeNull();
  });
});
