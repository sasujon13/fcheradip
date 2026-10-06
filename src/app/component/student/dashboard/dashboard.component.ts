import { Component, OnInit, AfterViewInit, HostListener } from '@angular/core';
import { StudentService } from '../../../service/student.service';
import { LoadingService } from 'src/app/service/loading.service';
import { of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ApiService } from '../../../service/api.service';
import { MatSnackBar } from '@angular/material/snack-bar';

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
  profilePictureMenuOpen = false;
  profilePictureBusy = false;
  get baseProgressPercent(): number {
    const completed = Number(this.packageStatus?.completedTasks || 0);
    const remaining = Number(this.packageStatus?.remainingTasks || 0);
    return remaining <= 0 ? 100 : Math.min(100, Math.round(completed * 100 / (completed + remaining)));
  }

  constructor(
    private studentService: StudentService,
    private loadingService: LoadingService,
    private api: ApiService,
    private snackBar: MatSnackBar
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

  openProfilePictureMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.profilePictureMenuOpen = event.type === 'contextmenu' ? true : !this.profilePictureMenuOpen;
  }

  chooseProfilePicture(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    event.stopPropagation();
    this.profilePictureMenuOpen = false;
    input.click();
  }

  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.showProfileMessage('Use a JPG, PNG, or WebP image up to 5 MB.', true);
      return;
    }
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(image.src);
        this.showProfileMessage('Profile picture could not be prepared.', true);
        return;
      }
      context.beginPath();
      context.arc(256, 256, 256, 0, Math.PI * 2);
      context.clip();
      context.drawImage(
        image,
        (image.naturalWidth - side) / 2,
        (image.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        512,
        512
      );
      URL.revokeObjectURL(image.src);
      canvas.toBlob((blob) => {
        if (!blob) {
          this.showProfileMessage('Profile picture could not be prepared.', true);
          return;
        }
        this.profilePictureBusy = true;
        this.api.uploadProfilePicture(blob).subscribe({
          next: (data) => {
            this.profilePictureBusy = false;
            this.packageStatus = { ...(this.packageStatus || {}), profileImageUrl: data?.profileImageUrl || null };
            this.showProfileMessage('Profile picture updated.');
          },
          error: (error) => {
            this.profilePictureBusy = false;
            this.showProfileMessage(error?.error?.error || 'Profile picture could not be updated.', true);
          },
        });
      }, 'image/webp', .9);
    };
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      this.showProfileMessage('The selected image could not be opened.', true);
    };
    image.src = URL.createObjectURL(file);
  }

  clearProfilePicture(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.profilePictureMenuOpen = false;
    this.profilePictureBusy = true;
    this.api.removeProfilePicture().subscribe({
      next: () => {
        this.profilePictureBusy = false;
        this.packageStatus = { ...(this.packageStatus || {}), profileImageUrl: null };
        this.showProfileMessage('Profile picture cleared.');
      },
      error: () => {
        this.profilePictureBusy = false;
        this.showProfileMessage('Profile picture could not be cleared.', true);
      },
    });
  }

  @HostListener('document:click')
  closeProfilePictureMenu(): void {
    this.profilePictureMenuOpen = false;
  }

  private showProfileMessage(message: string, error = false): void {
    this.snackBar.open(message, 'Close', {
      duration: error ? 7000 : 5000,
      panelClass: ['package-center-snackbar', error ? 'error-snackbar' : 'success-snackbar'],
    });
  }
}

