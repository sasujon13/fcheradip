import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { WelcomeBonusCeremonyService } from '../../service/welcome-bonus-ceremony.service';

/**
 * Development-only page to preview the welcome bonus overlay without signing up.
 * Open: /dev/welcome-ceremony (ng serve, non-production build)
 */
@Component({
  selector: 'app-welcome-ceremony-preview',
  templateUrl: './welcome-ceremony-preview.component.html',
  styleUrls: ['./welcome-ceremony-preview.component.css'],
})
export class WelcomeCeremonyPreviewComponent implements OnInit {
  constructor(
    private ceremony: WelcomeBonusCeremonyService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (environment.production) {
      void this.router.navigate(['/index']);
    }
  }

  play(): void {
    this.ceremony.previewForDesign();
  }
}
