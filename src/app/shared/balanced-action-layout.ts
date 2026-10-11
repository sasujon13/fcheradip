/** Balance wide-screen rows; wrap into 3, 2 or 1 columns on smaller screens. */
export function balancedActionLayout(count: number, width: number, gap = 13, minWidth = 140) {
  const preferredColumns = count < 7 || width >= count * minWidth + (count - 1) * gap
    ? Math.max(1, count)
    : Math.ceil(count / 2);
  const capacity = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
  const columns = width < 720 || preferredColumns > capacity
    ? Math.max(1, Math.min(count, 3, capacity))
    : preferredColumns;
  return {
    columns,
    positions: Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / columns);
      const rowCount = Math.min(columns, count - row * columns);
      // Half-card tracks center a shorter last row without changing its gaps.
      return { row: row + 1, column: (index % columns) * 2 + 1 + columns - rowCount };
    }),
  };
}
