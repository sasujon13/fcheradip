import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../../service/api.service';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.css'],
  standalone: false,
})
export class HistoryComponent implements OnInit, OnDestroy {
  loading = true;
  error = '';
  profile: any = null;
  wallet: any = null;
  packages: any[] = [];
  orders: any[] = [];
  packageTotal = 0;
  orderTotal = 0;
  loadingMore: 'packages' | 'orders' | null = null;
  loadMoreError = '';
  sectionOrder: ReadonlyArray<'packages' | 'orders'> = ['packages', 'orders'];
  private readonly destroyed = new Subject<void>();

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroyed)).subscribe(params => {
      this.sectionOrder = params.get('from')?.toLowerCase() === 'ecommerce'
        ? ['orders', 'packages'] : ['packages', 'orders'];
    });
    this.api.getCommerceHistory().pipe(takeUntil(this.destroyed)).subscribe({
      next: value => {
        this.profile = value?.profile || null;
        this.wallet = value?.wallet || null;
        this.packages = Array.isArray(value?.packages) ? value.packages : [];
        this.orders = Array.isArray(value?.orders) ? value.orders : [];
        this.packageTotal = Number(value?.packageTotal ?? this.packages.length);
        this.orderTotal = Number(value?.orderTotal ?? this.orders.length);
        this.loading = false;
      },
      error: error => {
        this.error = error?.error?.detail || 'Your purchase history could not be loaded.';
        this.loading = false;
      },
    });
  }

  loadMore(section: 'packages' | 'orders'): void {
    if (this.loadingMore) return;
    this.loadMoreError = '';
    this.loadingMore = section;
    this.api.getCommerceHistory(this.packages.length, this.orders.length).pipe(takeUntil(this.destroyed)).subscribe({
      next: value => {
        this.packages = [...this.packages, ...(value?.packages || [])];
        this.orders = [...this.orders, ...(value?.orders || [])];
        this.packageTotal = Number(value?.packageTotal ?? this.packageTotal);
        this.orderTotal = Number(value?.orderTotal ?? this.orderTotal);
        this.loadingMore = null;
      },
      error: error => {
        this.loadMoreError = error?.error?.detail || 'Could not load more history.';
        this.loadingMore = null;
      },
    });
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }
}
