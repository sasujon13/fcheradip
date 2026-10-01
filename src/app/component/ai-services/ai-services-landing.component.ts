import { Component } from '@angular/core';
import {
  CHERADIP_PRODUCT_SITES,
  CheradipProductSite,
  productHrefForHostname,
} from '../../config/product-sites';

@Component({
  selector: 'app-ai-services-landing',
  templateUrl: './ai-services-landing.component.html',
  styleUrls: ['./ai-services-landing.component.css'],
  standalone: false,
})
export class AiServicesLandingComponent {
  readonly services = CHERADIP_PRODUCT_SITES.filter(product =>
    ['tutor', 'agent', 'ailt'].includes(product.id)
  );

  href(product: CheradipProductSite): string {
    return productHrefForHostname(product, window.location.hostname);
  }

  get homeHref(): string {
    const host = window.location.hostname.toLowerCase();
    return ['localhost', '127.0.0.1', '::1'].includes(host)
      ? '/index'
      : 'https://cheradip.com/index';
  }
}
