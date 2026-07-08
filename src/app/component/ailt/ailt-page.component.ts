import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/**
 * Full-page host for a static AI Language Tutor / Cheradip page in assets/ailt/.
 * The route supplies `data.page` (e.g. "pricing" -> assets/ailt/pricing.html).
 */
@Component({
  selector: 'app-ailt-page',
  template: `<iframe class="ailt-manual-frame" [src]="src" [title]="title"></iframe>`,
  styleUrls: ['./ailt-manual.component.css'],
})
export class AiltPageComponent {
  src: SafeResourceUrl;
  title = 'Cheradip';

  constructor(route: ActivatedRoute, sanitizer: DomSanitizer) {
    const page = (route.snapshot.data['page'] as string) || 'pricing';
    this.title = (route.snapshot.data['title'] as string) || 'Cheradip';
    this.src = sanitizer.bypassSecurityTrustResourceUrl(`assets/ailt/${page}.html`);
  }
}
