import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy } from '@angular/core';
import { balancedActionLayout } from './balanced-action-layout';

@Directive({ selector: '[appBalancedActionCards]', standalone: false })
export class BalancedActionCardsDirective implements AfterViewInit, OnDestroy {
  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private frame = 0;

  constructor(private element: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.layout();
      this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
      this.resizeObserver.observe(this.element.nativeElement);
      this.mutationObserver = new MutationObserver(() => this.scheduleLayout());
      this.mutationObserver.observe(this.element.nativeElement, { childList: true });
    });
  }

  private scheduleLayout(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.layout();
    });
  }

  private layout(): void {
    const host = this.element.nativeElement;
    const cards = Array.from(host.children).filter((child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains('action-card')
    );
    const style = getComputedStyle(host);
    const gap = parseFloat(style.columnGap) || 13;
    const width = host.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const layout = balancedActionLayout(cards.length, width, gap);
    host.style.setProperty('--action-grid-tracks', String(layout.columns * 2));
    cards.forEach((card, index) => {
      card.style.gridColumn = `${layout.positions[index].column} / span 2`;
      card.style.gridRow = String(layout.positions[index].row);
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
  }
}
