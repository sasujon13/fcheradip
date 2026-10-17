/** Choose the layout from the names at the proposed single-row width, not from
 * the already-expanded compact layout (which would oscillate on every resize). */
export class CreatedQuestionsRowLayout {
  private resizeObserver: ResizeObserver;
  private mutationObserver: MutationObserver;
  private frame = 0;
  private disposed = false;

  constructor(private host: HTMLElement) {
    this.resizeObserver = new ResizeObserver(() => this.schedule());
    // Angular component hosts are inline by default; observe the block page so
    // viewport resizing is reported even when the host has no content box.
    this.resizeObserver.observe(host.querySelector('.created-questions-page') || host);
    this.mutationObserver = new MutationObserver(() => this.schedule());
    this.mutationObserver.observe(host, { childList: true, subtree: true, characterData: true });
    document.fonts?.ready.then(() => this.schedule());
    this.schedule();
  }

  private schedule(): void {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.refresh();
    });
  }

  refresh(): void {
    const wrap = this.host.querySelector<HTMLElement>('.sets-table-wrap');
    const rows = [...this.host.querySelectorAll<HTMLElement>('.set-row')];
    if (!wrap || !rows.length || !wrap.clientWidth) return;
    // Always reserve the regular column widths, even when compact/mobile CSS is
    // active. Measuring the current cells instead would change the threshold.
    const rootRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const fixedColumns = 5.5 * rootRem;
    const detailsWidth = Math.ceil(Math.max(...rows.map(row => {
      const metadata = row.querySelector<HTMLElement>('.set-metadata')!;
      const actions = row.querySelector<HTMLElement>('.actions-inline')!;
      return metadata.getBoundingClientRect().width + actions.getBoundingClientRect().width
        + 0.75 * rootRem;
    })) + 0.75 * rootRem + 12);
    const titleWidth = wrap.clientWidth - fixedColumns - detailsWidth - 1.5 * rootRem;
    const names = rows.map(row => row.querySelector<HTMLElement>('.set-name-counter')).filter((name): name is HTMLElement => !!name);
    if (!names.length) return;

    const probe = document.createElement('span');
    Object.assign(probe.style, {
      position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden',
      display: 'block', width: `${Math.max(1, titleWidth)}px`, overflowWrap: 'anywhere',
      whiteSpace: 'normal', pointerEvents: 'none',
    });
    document.body.appendChild(probe);
    try {
      // Keep one row as long as ANY visible name still fits in two lines.
      const allNamesTruncated = titleWidth <= 0 || names.every(name => {
        const style = getComputedStyle(name);
        probe.style.font = style.font;
        probe.style.lineHeight = style.lineHeight;
        probe.style.letterSpacing = style.letterSpacing;
        probe.textContent = name.textContent;
        return probe.getBoundingClientRect().height > parseFloat(style.lineHeight) * 2 + 1;
      });
      wrap.style.setProperty('--set-details-width', `${detailsWidth}px`);
      wrap.classList.toggle('sets-table-wrap--compact', allNamesTruncated);
    } finally {
      probe.remove();
    }
  }

  destroy(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.mutationObserver.disconnect();
    cancelAnimationFrame(this.frame);
  }
}
