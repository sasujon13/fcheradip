import { Component, OnInit, AfterViewInit } from '@angular/core';
import { StudentService } from '../../../service/student.service';
import { LoadingService } from 'src/app/service/loading.service';
import { of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ApiService } from '../../../service/api.service';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.css'],
    standalone: false
})
export class DashboardComponent implements OnInit, AfterViewInit {
  errorMessage = '';
  stats: any = {
    examsCompleted: 0,
    averageScore: 0,
    currentRank: 0,
    loginStreak: 0,
    totalPoints: 0,
    currentLevel: 1
  };
  packageStatus: any = null;
  get baseProgressPercent(): number {
    const completed = Number(this.packageStatus?.completedTasks || 0);
    const remaining = Number(this.packageStatus?.remainingTasks || 0);
    return remaining <= 0 ? 100 : Math.min(100, Math.round(completed * 100 / (completed + remaining)));
  }

  constructor(
    private studentService: StudentService,
    private loadingService: LoadingService,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.loadDashboardData();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  loadDashboardData(): void {
    this.errorMessage = '';
    this.studentService.syncLocalExamResults().pipe(
      catchError(() => of(null)),
      switchMap(() => this.studentService.getStudentStats())
    ).subscribe({
      next: (data: any) => { this.stats = { ...this.stats, ...(data || {}) }; },
      error: () => { this.errorMessage = 'Your progress could not be loaded. Please refresh and try again.'; }
    });
    this.api.getPackageStatus().subscribe({ next: (data) => this.packageStatus = data, error: () => {} });
  }
}

