import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-books',
  templateUrl: './books.component.html',
  styleUrls: ['./books.component.css']
})
export class BooksComponent implements OnInit{
  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'none';
    }
  }

}

