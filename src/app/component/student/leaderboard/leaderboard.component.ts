import { Component, OnInit, AfterViewInit } from '@angular/core';
import { LeaderboardService } from '../../../service/leaderboard.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
    selector: 'app-leaderboard',
    templateUrl: './leaderboard.component.html',
    styleUrls: ['./leaderboard.component.css'],
    standalone: false
})
export class LeaderboardComponent implements OnInit, AfterViewInit {
  loading = false;
  errorMessage = '';
  selectedGroup: string = '';
  selectedSubject: string = '';
  selectedPeriod: string = 'all-time';
  leaderboard: any[] = [];
  currentUserRank: number = 0;
  groups = ['S', 'A', 'B', 'I', 'H', 'M'];
  periods = ['weekly', 'monthly', 'yearly', 'all-time'];

  constructor(
    private leaderboardService: LeaderboardService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.loadLeaderboard();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  loadLeaderboard(): void {
    this.loading = true;
    this.errorMessage = '';
    const filters: any = {};
    if (this.selectedGroup) filters.group = this.selectedGroup;
    if (this.selectedSubject) filters.subject = this.selectedSubject;
    if (this.selectedPeriod) filters.period = this.selectedPeriod;

    this.leaderboardService.getLeaderboard(filters).subscribe({
      next: (data: any) => {
        this.leaderboard = data.leaderboard || [];
        this.currentUserRank = data.user_rank || 0;
        this.loading = false;
      },
      error: () => {
        this.leaderboard = [];
        this.currentUserRank = 0;
        this.loading = false;
        this.errorMessage = 'The leaderboard could not be loaded. Please try again.';
      }
    });
  }

  onFilterChange(): void {
    this.loadLeaderboard();
  }
}
