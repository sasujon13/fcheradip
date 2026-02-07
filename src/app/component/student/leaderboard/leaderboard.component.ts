import { Component, OnInit } from '@angular/core';
import { LeaderboardService } from '../../../service/leaderboard.service';

@Component({
  selector: 'app-leaderboard',
  templateUrl: './leaderboard.component.html',
  styleUrls: ['./leaderboard.component.css']
})
export class LeaderboardComponent implements OnInit {
  selectedGroup: string = '';
  selectedSubject: string = '';
  selectedPeriod: string = 'all-time';
  leaderboard: any[] = [];
  currentUserRank: number = 0;
  groups = ['S', 'A', 'B', 'I', 'H', 'M'];
  periods = ['weekly', 'monthly', 'yearly', 'all-time'];

  constructor(private leaderboardService: LeaderboardService) { }

  ngOnInit(): void {
    this.loadLeaderboard();
  }

  loadLeaderboard(): void {
    const filters: any = {};
    if (this.selectedGroup) filters.group = this.selectedGroup;
    if (this.selectedSubject) filters.subject = this.selectedSubject;
    if (this.selectedPeriod) filters.period = this.selectedPeriod;

    this.leaderboardService.getLeaderboard(filters).subscribe(
      (data: any) => {
        this.leaderboard = data.leaderboard || [];
        this.currentUserRank = data.user_rank || 0;
      }
    );
  }

  onFilterChange(): void {
    this.loadLeaderboard();
  }
}
