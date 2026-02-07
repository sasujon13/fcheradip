import { HttpClient } from '@angular/common/http';
import { Component, Renderer2 } from '@angular/core';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent {
  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');

  if (searchBarElement) {
    searchBarElement.style.display = 'block';
  }
}    constructor(private http: HttpClient, private renderer: Renderer2) { }
    ngAfterViewInit(): void {
      const signMenu = document.getElementById('sign_menu');
      if (signMenu) {
        this.renderer.setStyle(signMenu, 'display', 'flex');
      }
    }

}
