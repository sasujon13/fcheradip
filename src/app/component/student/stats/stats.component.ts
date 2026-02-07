import { Component, OnInit } from '@angular/core';
import { StudentService } from '../../../service/student.service';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrls: ['./stats.component.css']
})
export class StatsComponent implements OnInit {
  stats: any = {
    totalPoints: 0,
    currentLevel: 1,
    xp: 0,
    xpToNextLevel: 100,
    currentRank: 0,
    streak: 0,
    longestStreak: 0,
    examsCompleted: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    accuracy: 0,
    achievements: []
  };

  achievements: any[] = [];

  constructor(private studentService: StudentService) { }

  ngOnInit(): void {
    this.loadStats();
    this.loadAchievements();
  }

  loadStats(): void {
    this.studentService.getStudentStats().subscribe(
      (data: any) => {
        this.stats = { ...this.stats, ...data };
        this.calculateAccuracy();
      }
    );
  }

  loadAchievements(): void {
    // Load achievements from stats
    this.achievements = [
      {
        id: 1,
        title: 'First Exam',
        description: 'Complete your first exam',
        icon: '🎯',
        isUnlocked: this.stats.examsCompleted >= 1,
        progress: Math.min(100, (this.stats.examsCompleted / 1) * 100)
      },
      {
        id: 2,
        title: 'Perfect Score',
        description: 'Get 100% in an exam',
        icon: '⭐',
        isUnlocked: false,
        progress: 0
      },
      {
        id: 3,
        title: 'Streak Master',
        description: 'Login for 7 days in a row',
        icon: '🔥',
        isUnlocked: this.stats.streak >= 7,
        progress: Math.min(100, (this.stats.streak / 7) * 100)
      },
      {
        id: 4,
        title: 'Exam Master',
        description: 'Complete 10 exams',
        icon: '🏆',
        isUnlocked: this.stats.examsCompleted >= 10,
        progress: Math.min(100, (this.stats.examsCompleted / 10) * 100)
      }
    ];
  }

  calculateAccuracy(): void {
    if (this.stats.questionsAnswered > 0) {
      this.stats.accuracy = Math.round((this.stats.correctAnswers / this.stats.questionsAnswered) * 100);
    }
  }

  getLevelProgress(): number {
    return (this.stats.xp / this.stats.xpToNextLevel) * 100;
  }
}
