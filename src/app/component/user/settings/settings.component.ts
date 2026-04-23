import { Component, OnInit, AfterViewInit } from '@angular/core';
import { switchMap, take } from 'rxjs/operators';
import {
  ApiService,
  CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY,
} from '../../../service/api.service';
import { LoadingService } from 'src/app/service/loading.service';

export type ExportFormat = 'both' | 'pdf' | 'docx';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit, AfterViewInit {
  exportFormat: ExportFormat = 'both';
  saving = false;
  message = '';

  constructor(
    private apiService: ApiService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
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

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  save(): void {
    this.saving = true;
    this.message = '';
    this.apiService
      .getCustomerSettings()
      .pipe(
        take(1),
        switchMap((res) => {
          const patch: Record<string, unknown> = { export_format: this.exportFormat };
          const qc = res.settings?.[CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY];
          if (typeof qc === 'string' && qc.length > 0) {
            patch[CUSTOMER_SETTINGS_QUESTION_CREATOR_KEY] = qc;
          }
          return this.apiService.updateCustomerSettings(patch as Record<string, any>);
        })
      )
      .subscribe({
        next: () => {
          this.message = 'Settings saved. Your next download will use the selected format.';
          this.saving = false;
        },
        error: () => {
          this.message = 'Failed to save settings.';
          this.saving = false;
        },
      });
  }
}
