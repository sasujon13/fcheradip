import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/**
 * Full-page host for static HTML under assets/{folder}/.
 * Route data: `page` (filename without .html), optional `folder` (default "ailt").
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
    const page = (route.snapshot.data['page'] as string) || 'privacy';
    const folder = (route.snapshot.data['folder'] as string) || 'ailt';
    this.title = (route.snapshot.data['title'] as string) || 'Cheradip';
    // Absolute (root-relative) path so the iframe resolves correctly at any
    // route depth (e.g. /ailt/privacy, /aicodingagent/pricing).
    this.src = sanitizer.bypassSecurityTrustResourceUrl(`/assets/${folder}/${page}.html`);
  }
}
