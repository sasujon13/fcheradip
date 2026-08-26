import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-searchbar',
  templateUrl: './searchbar.component.html',
  styleUrls: ['./searchbar.component.css']
})
export class SearchBarComponent {
  @Output() searchChange = new EventEmitter<string>();
  @Output() searchSubmit = new EventEmitter<string>();
  
  searchTerm: string = '';

  onSearch(): void {
    this.searchChange.emit(this.searchTerm);
  }

  onInputChange(): void {
    this.onSearch();
  }

  onSubmit(): void {
    this.onSearch();
    this.searchSubmit.emit(this.searchTerm);
  }
}

