import { HttpClient } from '@angular/common/http';
import { Component, OnInit, Renderer2 } from '@angular/core';
import { ApiService } from 'src/app/service/api.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css'],
})
export class AdminComponent implements OnInit {
  constructor(
    private apiService: ApiService,
    private http: HttpClient,
    private renderer: Renderer2,
    private loadingService: LoadingService
  ) {}
  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.apiService.adminRedirect();
  }
  ngAfterViewInit(): void {
    const signMenu = document.getElementById('sign_menu');
    if (signMenu) {
      this.renderer.setStyle(signMenu, 'display', 'flex');
    }
    setTimeout(() => this.loadingService.completeOne(), 0);
  }
}
