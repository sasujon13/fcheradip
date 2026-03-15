import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../../service/api.service';

export type ExportFormat = 'both' | 'pdf' | 'docx';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  exportFormat: ExportFormat = 'both';
  saving = false;
  message = '';

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.apiService.getCustomerSettings().subscribe({
      next: (res) => {
        const format = res.settings?.['export_format'] as ExportFormat | undefined;
        if (format === 'both' || format === 'pdf' || format === 'docx') {
          this.exportFormat = format;
        }
      },
      error: () => {}
    });
  }

  save(): void {
    this.saving = true;
    this.message = '';
    this.apiService.updateCustomerSettings({ export_format: this.exportFormat }).subscribe({
      next: () => {
        this.message = 'Settings saved. Your next download will use the selected format.';
        this.saving = false;
      },
      error: () => {
        this.message = 'Failed to save settings.';
        this.saving = false;
      }
    });
  }
}
