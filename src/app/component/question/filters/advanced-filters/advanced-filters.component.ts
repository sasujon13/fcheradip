import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-advanced-filters',
  templateUrl: './advanced-filters.component.html',
  styleUrls: ['./advanced-filters.component.css']
})
export class AdvancedFiltersComponent {
  @Output() filterChange = new EventEmitter<any>();

  filters = {
    type: '',
    year: '',
    marksMin: '',
    marksMax: '',
    difficulty: '',
    tags: ''
  };

  onFilterChange(): void {
    this.filterChange.emit(this.filters);
  }

  resetFilters(): void {
    this.filters = {
      type: '',
      year: '',
      marksMin: '',
      marksMax: '',
      difficulty: '',
      tags: ''
    };
    this.onFilterChange();
  }
}

