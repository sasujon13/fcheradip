import { HttpClient } from '@angular/common/http';
import { Component, OnInit, Renderer2 } from '@angular/core';

@Component({
  selector: 'app-packages',
  templateUrl: './packages.component.html',
  styleUrls: ['./packages.component.css']
})
export class PackagesComponent implements OnInit {

  constructor(private http: HttpClient, private renderer: Renderer2) { }

  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'block';
    }
    // document.addEventListener('contextmenu', function (event) {
    //   event.preventDefault();
    // });
  }

  ngAfterViewInit(): void {
    const signMenu = document.getElementById('sign_menu');
    if (signMenu) {
      this.renderer.setStyle(signMenu, 'display', 'flex');
    }
  }
}

