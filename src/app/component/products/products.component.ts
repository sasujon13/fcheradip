import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.css']
})
export class ProductsComponent implements OnInit {

  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'block';
    }
    // document.addEventListener('contextmenu', function (event) {
    //   event.preventDefault();
    // });
    
  }}