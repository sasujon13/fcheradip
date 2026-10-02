import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-badge-profile',
  templateUrl: './badge-profile.component.html',
  styleUrls: ['./badge-profile.component.css'],
  standalone: false,
})
export class BadgeProfileComponent {
  @Input() badge = 'Star';
  @Input() imageUrl: string | null = null;
  @Input() size = 34;
  get badgeClass(): string { return 'badge-' + (this.badge || 'Star').toLowerCase().replace('+', '-plus'); }
}
