import { Component, OnInit, AfterViewInit } from '@angular/core';
import { StudentService } from '../../../service/student.service';
import { LoadingService } from 'src/app/service/loading.service';
import { ApiService } from '../../../service/api.service';

/**
 * Top-level `/dashboard` route — copied from student dashboard for independent edits.
 * Student area still uses {@link DashboardComponent} at `/student/dashboard`.
 */
@Component({
    selector: 'app-home-dashboard',
    templateUrl: './home-dashboard.component.html',
    styleUrls: ['./home-dashboard.component.css'],
    standalone: false
})
export class HomeDashboardComponent implements OnInit, AfterViewInit {
  packageStatus: any = null;
  stats: any = {
    examsCompleted: 0,
    averageScore: 0,
    currentRank: 0,
    loginStreak: 0,
    totalPoints: 0,
    currentLevel: 1,
  };

  constructor(
    private studentService: StudentService,
    private loadingService: LoadingService,
    private api: ApiService,
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.loadDashboardData();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  loadDashboardData(): void {
    this.studentService.getStudentStats().subscribe((data: any) => {
      this.stats = data;
    });
    this.api.getPackageStatus().subscribe({ next: data => this.packageStatus = data, error: () => {} });
  }

  get activatedPackageLabel(): string {
    const rows = Array.isArray(this.packageStatus?.activeSubscriptions) ? this.packageStatus.activeSubscriptions : [];
    if (!rows.length) return 'Free';
    return rows.map((row: any) => `${row.planName || 'Package'} — ${row.track || ''}`).join(' + ');
  }
}
