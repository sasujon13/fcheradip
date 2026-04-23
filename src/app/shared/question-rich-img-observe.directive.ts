import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { applyQuestionRichImgSizing } from './question-rich-img.sizing';

const SEL = 'img.q-rich-img';
const SIZED = 'data-rich-sized';
const LATEX_TRY = 'span.q-rich-media-try-latex:not([data-q-latex-resolved])';

/**
 * Observes dynamic HTML (e.g. innerHTML from formatQuestionMedia + wrapRomanLines) and sizes
 * loaded images using {@link applyQuestionRichImgSizing}.
 *
 * For `.q-rich-media-try-latex`: **SVG** first (`/manage/media/latex/.../*.svg`, exact then stem when captioned) — loaded
 * into the existing `<img>` for normal sizing; if no SVG exists, fall back to the original image `data-q-img-src`.
 *
 * Optional {@link appQuestionRichImgFontTrigger}: when MCQ/CQ preview fonts (or global sync) change —
 * including auto-fit — re-run sizing so the cap tracks font (7px→240px … up to 480px).
 */
@Directive({
  selector: '[appQuestionRichImgHost]',
})
export class QuestionRichImgObserveDirective
  implements AfterViewInit, OnChanges, OnDestroy
{
  /** When this value changes, all images under the host are re-sized. */
  @Input() appQuestionRichImgFontTrigger: string | number | null = null;

  private mo?: MutationObserver;
  private ro?: ResizeObserver;
  private scheduled?: ReturnType<typeof setTimeout>;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['appQuestionRichImgFontTrigger']) {
      return;
    }
    const host = this.el?.nativeElement;
    if (!host) {
      return;
    }
    host.querySelectorAll(SEL).forEach((n) => {
      n.removeAttribute(SIZED);
    });
    this.scan(host);
  }

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    const run = () => {
      this.scan(host);
    };
    run();
    this.mo = new MutationObserver(() => {
      if (this.scheduled != null) {
        clearTimeout(this.scheduled);
      }
      this.scheduled = setTimeout(() => {
        this.scheduled = undefined;
        run();
      }, 0);
    });
    this.mo.observe(host, { childList: true, subtree: true });
    this.ro = new ResizeObserver(() => {
      host.querySelectorAll(SEL).forEach((n) => {
        n.removeAttribute(SIZED);
      });
      this.scan(host);
    });
    this.ro.observe(host);
  }

  ngOnDestroy(): void {
    if (this.scheduled != null) {
      clearTimeout(this.scheduled);
    }
    this.mo?.disconnect();
    this.ro?.disconnect();
  }

  private scan(root: HTMLElement): void {
    root.querySelectorAll(LATEX_TRY).forEach((node) => {
      void this.tryResolveLatex(node as HTMLSpanElement);
    });

    root.querySelectorAll(SEL).forEach((node) => {
      const img = node as HTMLImageElement;
      if (img.getAttribute(SIZED) === '1') {
        return;
      }
      if (img.dataset['richObserve'] === '1') {
        return;
      }
      const srcNow = img.getAttribute('src');
      if ((!srcNow || srcNow.trim() === '') && img.dataset['qImgSrc']) {
        return;
      }

      const finish = (): void => {
        applyQuestionRichImgSizing(img);
        img.setAttribute(SIZED, '1');
        delete img.dataset['richObserve'];
      };

      /** One frame so column `clientWidth` is reliable inside transformed preview. */
      const done = (): void => {
        requestAnimationFrame(() => finish());
      };

      img.dataset['richObserve'] = '1';

      const fallbackAttr = (): string | null => img.getAttribute('data-q-media-fallback');

      const tryStemFallbackOrMarkDone = (): void => {
        const fb = fallbackAttr();
        if (fb && img.dataset['qMediaTried'] !== '1') {
          img.dataset['qMediaTried'] = '1';
          img.src = fb;
          img.addEventListener(
            'load',
            () => {
              if (img.naturalWidth > 0) {
                done();
              } else {
                img.setAttribute(SIZED, '1');
                delete img.dataset['richObserve'];
              }
            },
            { once: true }
          );
          img.addEventListener(
            'error',
            () => {
              img.setAttribute(SIZED, '1');
              delete img.dataset['richObserve'];
            },
            { once: true }
          );
          return;
        }
        img.setAttribute(SIZED, '1');
        delete img.dataset['richObserve'];
      };

      if (img.complete) {
        if (img.naturalWidth > 0) {
          done();
        } else {
          tryStemFallbackOrMarkDone();
        }
      } else {
        img.addEventListener(
          'load',
          () => {
            if (img.naturalWidth > 0) {
              done();
            } else {
              tryStemFallbackOrMarkDone();
            }
          },
          { once: true }
        );
        img.addEventListener(
          'error',
          () => {
            tryStemFallbackOrMarkDone();
          },
          { once: true }
        );
      }
    });
  }

  private async tryResolveLatex(span: HTMLSpanElement): Promise<void> {
    if (span.getAttribute('data-q-latex-resolved')) {
      return;
    }
    span.setAttribute('data-q-latex-resolved', 'pending');
    const svgPrimary = span.getAttribute('data-q-svg-primary');
    const svgFallback = span.getAttribute('data-q-svg-fallback');
    const imgSrc = span.getAttribute('data-q-img-src');
    const mediaFb = span.getAttribute('data-q-media-fallback');

    const clearPendingAttrs = (resolvedAs: string): void => {
      span.classList.remove('q-rich-media-try-latex');
      span.removeAttribute('data-q-svg-primary');
      span.removeAttribute('data-q-svg-fallback');
      span.removeAttribute('data-q-img-src');
      span.removeAttribute('data-q-media-fallback');
      span.setAttribute('data-q-latex-resolved', resolvedAs);
    };

    const fetchResponse = async (url: string | null): Promise<Response | null> => {
      if (!url) {
        return null;
      }
      try {
        const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) {
          return null;
        }
        return r;
      } catch {
        return null;
      }
    };

    const fetchSvgBlobUrl = async (url: string | null): Promise<string | null> => {
      const r = await fetchResponse(url);
      if (!r) {
        return null;
      }
      try {
        const blob = await r.blob();
        const contentType = (blob.type || r.headers.get('content-type') || '').toLowerCase();
        const looksLikeSvg =
          contentType.includes('image/svg+xml') ||
          (await blob.text()).slice(0, 512).toLowerCase().includes('<svg');
        if (!looksLikeSvg) {
          return null;
        }
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    };

    let svgBlobUrl = await fetchSvgBlobUrl(svgPrimary);
    if (svgBlobUrl == null && svgFallback) {
      svgBlobUrl = await fetchSvgBlobUrl(svgFallback);
    }
    if (svgBlobUrl != null) {
      const img = span.querySelector('img.q-rich-img') as HTMLImageElement | null;
      if (img) {
        img.removeAttribute(SIZED);
        delete img.dataset['richObserve'];
        delete img.dataset['qMediaTried'];
        img.removeAttribute('data-q-media-fallback');
        img.src = svgBlobUrl;
        clearPendingAttrs('svg');
        this.scan(span);
        return;
      }
    }

    const img = span.querySelector('img.q-rich-img') as HTMLImageElement | null;
    if (img && imgSrc) {
      img.src = imgSrc;
      if (mediaFb) {
        img.setAttribute('data-q-media-fallback', mediaFb);
      }
      img.removeAttribute(SIZED);
      delete img.dataset['richObserve'];
      delete img.dataset['qMediaTried'];
      this.scan(span);
    }
    clearPendingAttrs('img');
  }
}
