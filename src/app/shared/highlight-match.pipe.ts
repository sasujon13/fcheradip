import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Wraps portions of text/String/SafeHtml matching any token from searchTerm
 * in <mark class="highlight-match"> (yellow background).
 *
 * Fuzzy token-level matching: the search term is split on whitespace and
 * each token is highlighted independently. For example, searching
 * "question answer" highlights "question" and "answer" wherever they appear.
 *
 * Only matches text outside HTML tags (preserves existing markup).
 * When searchTerm is empty, returns the input unmodified.
 */
@Pipe({ name: 'highlightMatch' })
export class HighlightMatchPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {}

  transform(value: unknown, searchTerm?: string | null): string | SafeHtml {
    const term = (searchTerm ?? '').trim();
    // No search active: return the input as-is (string -> string, SafeHtml -> SafeHtml).
    if (!term) {
      if (typeof value === 'string') return value;
      if (value != null && typeof value === 'object' && 'changingThisBreaksApplicationSecurity' in (value as object))
        return value as SafeHtml;
      return value == null ? '' : String(value);
    }
    // Search mode: extract the HTML string, highlight, return as SafeHtml.
    const html = this.extractHtmlString(value);
    if (!html) return html;
    return this.sanitizer.bypassSecurityTrustHtml(this.highlightInHtml(html, term));
  }

  /** Get the underlying HTML string from a string or Angular SafeHtml wrapper. */
  private extractHtmlString(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    const raw = (value as any).changingThisBreaksApplicationSecurity;
    if (typeof raw === 'string') return raw;
    return String(value);
  }

  /**
   * Split HTML at tag boundaries and highlight only text segments.
   * Each whitespace-separated token in term is highlighted independently,
   * so a search of "question answer" highlights both "question" and "answer"
   * wherever they each appear.
   */
  private highlightInHtml(html: string, term: string): string {
    const tokens = term
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
    if (tokens.length === 0) return html;
    // Escape regex special chars in each token, then join as alternation.
    const escapedTokens = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // Sort longest first so longer tokens match before their substrings.
    escapedTokens.sort((a, b) => b.length - a.length);
    const pattern = escapedTokens.join('|');
    const re = new RegExp('(' + pattern + ')', 'gi');

    const parts = html.split(/(<[^>]*>)/g);
    return parts
      .map((segment) => {
        if (segment.startsWith('<')) return segment;
        return segment.replace(re, '<mark class="highlight-match">$1</mark>');
      })
      .join('');
  }
}