import { HttpClient } from '@angular/common/http';
import { Component, OnInit, Renderer2 } from '@angular/core';
import { ApiService } from 'src/app/service/api.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css'],
})
export class AdminComponent implements OnInit {
  constructor(private apiService: ApiService, private http: HttpClient, private renderer: Renderer2){}
  ngOnInit(): void {
    this.apiService.adminRedirect();
  }
    ngAfterViewInit(): void {
      const signMenu = document.getElementById('sign_menu');
      if (signMenu) {
        this.renderer.setStyle(signMenu, 'display', 'flex');
      }
    }
}
