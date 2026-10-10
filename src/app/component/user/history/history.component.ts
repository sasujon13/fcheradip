import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../../service/api.service';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.css'],
  standalone: false,
})
export class HistoryComponent implements OnInit {
  loading = true;
  error = '';
  profile: any = null;
  wallet: any = null;
  packages: any[] = [];
  orders: any[] = [];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.getCommerceHistory().subscribe({
      next: value => {
        this.profile = value?.profile || null;
        this.wallet = value?.wallet || null;
        this.packages = Array.isArray(value?.packages) ? value.packages : [];
        this.orders = Array.isArray(value?.orders) ? value.orders : [];
        this.loading = false;
      },
      error: error => {
        this.error = error?.error?.detail || 'Your purchase history could not be loaded.';
        this.loading = false;
      },
    });
  }
}
