import { balancedActionLayout } from './balanced-action-layout';

describe('Balanced dashboard actions', () => {
  it('keeps fewer than seven options in one row when space permits', () => {
    for (let count = 1; count < 7; count++) {
      const layout = balancedActionLayout(count, 1000);
      expect(layout.columns).toBe(count);
      expect(layout.positions.every(position => position.row === 1)).toBeTrue();
    }
  });

  it('uses one row when all options fit', () => {
    expect(balancedActionLayout(7, 1058).columns).toBe(7);
    expect(balancedActionLayout(13, 2200).columns).toBe(13);
  });

  it('balances seven as 4+3, twelve as 6+6, and thirteen as 7+6', () => {
    for (const [count, first, second] of [[7, 4, 3], [12, 6, 6], [13, 7, 6]]) {
      const layout = balancedActionLayout(count, count === 7 ? 800 : 1100);
      expect(layout.positions.filter(position => position.row === 1).length).toBe(first);
      expect(layout.positions.filter(position => position.row === 2).length).toBe(second);
      const lastRow = layout.positions.filter(position => position.row === 2);
      expect(lastRow[0].column).toBe(1 + first - second);
      expect(lastRow[lastRow.length - 1].column + 1).toBe(first * 2 - (first - second));
      expect(lastRow.slice(1).every((position, index) => position.column - lastRow[index].column === 2)).toBeTrue();
    }
  });

  it('uses three, two or one column on smaller screens', () => {
    for (const [width, columns] of [[650, 3], [320, 2], [220, 1]]) {
      const layout = balancedActionLayout(7, width);
      expect(layout.columns).toBe(columns);
      expect(layout.positions.filter(position => position.row === 1).length).toBe(columns);
    }
    expect(balancedActionLayout(6, 320).columns).toBe(2);
    expect(balancedActionLayout(1, 650).columns).toBe(1);
  });

  it('centers incomplete mobile rows without changing card spacing', () => {
    expect(balancedActionLayout(7, 650).positions[6]).toEqual({ row: 3, column: 3 });
    expect(balancedActionLayout(7, 320).positions[6]).toEqual({ row: 4, column: 2 });
  });

  it('never requests more columns than fit, even for larger lists', () => {
    for (const count of [6, 7, 12, 13]) {
      for (const width of [160, 320, 650, 800, 1100, 2200]) {
        const layout = balancedActionLayout(count, width);
        expect(layout.columns * 140 + (layout.columns - 1) * 13).toBeLessThanOrEqual(width);
      }
    }
  });

  it('handles an empty list safely', () => {
    expect(balancedActionLayout(0, 800)).toEqual({ columns: 1, positions: [] });
  });
});
