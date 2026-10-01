import { Component, OnInit } from '@angular/core';
import { WelcomeBonusCeremonyService } from '../../service/welcome-bonus-ceremony.service';

@Component({
    selector: 'app-welcome-ceremony-preview',
    templateUrl: './welcome-ceremony-preview.component.html',
    styleUrls: ['./welcome-ceremony-preview.component.css'],
    standalone: false
})
export class WelcomeCeremonyPreviewComponent implements OnInit {
  constructor(private ceremony: WelcomeBonusCeremonyService) {}

  ngOnInit(): void {
    this.ceremony.playStandaloneWelcomePage();
  }
}
