import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  Renderer2,
  SimpleChanges
} from '@angular/core';

@Directive({
  selector: '[hFilter]'
})
export class hDirective implements OnChanges {
  @Input('hFilter') searchText: string = '';

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges): void {
    const search = this.searchText.trim();

    this.removeHighlights(this.el.nativeElement);

    if (!search) return;

    const found = this.highlightMatches(this.el.nativeElement, search);

    if (found) {
      // Scroll to first match
      const first = this.el.nativeElement.querySelector('mark');
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  private highlightMatches(node: Node, search: string): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue || '';
      const index = value.toLowerCase().indexOf(search.toLowerCase());
      if (index >= 0) {
        const span = document.createElement('mark');
        span.style.backgroundColor = 'yellow';
        span.textContent = value.substr(index, search.length);

        const after = document.createTextNode(value.substr(index + search.length));
        const before = document.createTextNode(value.substr(0, index));

        const parent = node.parentNode!;
        parent.replaceChild(after, node);
        parent.insertBefore(span, after);
        parent.insertBefore(before, span);

        return true;
      }
      return false;
    }

    let found = false;
    node.childNodes.forEach(child => {
      if (this.highlightMatches(child, search)) {
        found = true;
      }
    });
    return found;
  }

  private removeHighlights(root: HTMLElement) {
    const marks = root.querySelectorAll('mark');
    marks.forEach(mark => {
      const parent = mark.parentNode!;
      const text = document.createTextNode(mark.textContent || '');
      parent.replaceChild(text, mark);
      parent.normalize(); // Merge adjacent text nodes
    });
  }
}
