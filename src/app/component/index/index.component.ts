import { Component, OnInit, Renderer2 } from '@angular/core';
import {
  CHERADIP_PRODUCT_SITES,
  CheradipProductSite,
  productHrefForHostname,
} from 'src/app/config/product-sites';
import { AuthSessionService } from 'src/app/service/auth-session.service';
import { getDefaultDashboardPath } from 'src/app/service/dashboard-route.util';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
    selector: 'app-index',
    templateUrl: './index.component.html',
    styleUrls: ['./index.component.css'],
    standalone: false
})
export class IndexComponent implements OnInit {
  readonly productSites = CHERADIP_PRODUCT_SITES;
  studentZoneLink = '/auth';

  productUrl(id: CheradipProductSite['id']): string {
    const product = this.productSites.find(item => item.id === id);
    return product ? this.productHref(product) : '/index';
  }

  productHref(product: CheradipProductSite): string {
    return productHrefForHostname(product, window.location.hostname);
  }

  ngOnInit(): void {
    this.studentZoneLink = this.authSession.hasStoredSession()
      ? getDefaultDashboardPath()
      : '/auth';
    this.loadingService.setTotal(1);
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'block';
    }
    // document.addEventListener('contextmenu', function (event) {
    //   event.preventDefault();
    // });
  }

    constructor(
    private renderer: Renderer2,
    private loadingService: LoadingService,
    private authSession: AuthSessionService
  ) {}
  ngAfterViewInit(): void {
    const signMenu = document.getElementById('sign_menu');
    if (signMenu) {
      this.renderer.setStyle(signMenu, 'display', 'flex');
    }
    setTimeout(() => this.loadingService.completeOne(), 0);
  }
  
}
