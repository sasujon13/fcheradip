import { Component } from '@angular/core';

@Component({
  selector: 'app-live-chat',
  templateUrl: './live-chat.component.html',
  styleUrls: ['./live-chat.component.css']
})
export class LiveChatComponent {
  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');

  if (searchBarElement) {
    searchBarElement.style.display = 'block';
  }
}

}
