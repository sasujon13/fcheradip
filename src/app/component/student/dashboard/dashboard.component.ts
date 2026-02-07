import { Component, OnInit } from '@angular/core';
import { StudentService } from '../../../service/student.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  stats: any = {
    examsCompleted: 0,
    averageScore: 0,
    currentRank: 0,
    loginStreak: 0,
    totalPoints: 0,
    currentLevel: 1
  };

  constructor(private studentService: StudentService) { }

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.studentService.getStudentStats().subscribe(
      (data: any) => {
        this.stats = data;
      }
    );
  }
}

