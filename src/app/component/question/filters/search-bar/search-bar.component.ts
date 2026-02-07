import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.css']
})
export class SearchBarComponent {
  @Output() searchChange = new EventEmitter<string>();
  
  searchTerm: string = '';

  onSearch(): void {
    this.searchChange.emit(this.searchTerm);
  }

  onInputChange(): void {
    this.onSearch();
  }
}

