import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ReportService } from '../../../service/report.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
  selector: 'app-report',
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.css']
})
export class ReportComponent implements OnInit, AfterViewInit {
  selectedPeriod: string = 'weekly';
  reportData: any = null;
  periods = [
    { value: 'weekly', label: 'Weekly (Last 7 days)' },
    { value: 'monthly', label: 'Monthly (Last 30 days)' },
    { value: 'quarterly', label: 'Quarterly (Last 3 months)' },
    { value: 'half-yearly', label: 'Half-Yearly (Last 6 months)' },
    { value: 'yearly', label: 'Yearly (Last 12 months)' },
    { value: 'all-time', label: 'All-Time' }
  ];

  constructor(
    private reportService: ReportService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.loadReport();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  selectedLevel: string = '';
  selectedGroup: string = '';
  levels = ['PSC', 'JSC', 'SSC', 'HSC'];
  groups = [
    { value: 'S', label: 'বিজ্ঞান (Science)' },
    { value: 'A', label: 'মানবিক (Humanities)' },
    { value: 'B', label: 'ব্যবসায় শিক্ষা (Business)' },
    { value: 'I', label: 'ইসলাম শিক্ষা (Islamic Studies)' },
    { value: 'H', label: 'গার্হস্থ্যবিজ্ঞান (Home Economics)' },
    { value: 'M', label: 'সঙ্গীত (Music)' }
  ];

  loadReport(): void {
    this.reportService.getReport(
      this.selectedPeriod,
      this.selectedLevel || undefined,
      this.selectedGroup || undefined
    ).subscribe(
      (data: any) => {
        this.reportData = data;
      }
    );
  }

  onPeriodChange(): void {
    this.loadReport();
  }

  onFilterChange(): void {
    this.loadReport();
  }

  downloadReport(): void {
    this.reportService.exportReportAsPDF(
      this.selectedPeriod,
      this.selectedLevel || undefined,
      this.selectedGroup || undefined
    ).subscribe(
      (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${this.selectedPeriod}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    );
  }
}

