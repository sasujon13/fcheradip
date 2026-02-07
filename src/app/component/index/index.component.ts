import { HttpClient } from '@angular/common/http';
import { Component, OnInit, Renderer2 } from '@angular/core';
import { ApiService } from 'src/app/service/api.service';
import { CartService } from 'src/app/service/cart.service';
import { ChoiceService } from 'src/app/service/choice.service';

@Component({
  selector: 'app-index',
  templateUrl: './index.component.html',
  styleUrls: ['./index.component.css']
})
export class IndexComponent implements OnInit {
  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'block';
    }
    // document.addEventListener('contextmenu', function (event) {
    //   event.preventDefault();
    // });
  }

    constructor(private http: HttpClient, private renderer: Renderer2) { }
    ngAfterViewInit(): void {
      const signMenu = document.getElementById('sign_menu');
      if (signMenu) {
        this.renderer.setStyle(signMenu, 'display', 'flex');
      }
    }
  
}
