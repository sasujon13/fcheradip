import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../../service/api.service';

export const QUESTION_CREATOR_STATE_KEY = 'questionCreatorReturnState';

export type MarginPreset = 'narrow' | 'standard' | 'wide' | 'custom';
export type ExportFormat = 'both' | 'pdf' | 'docx';

@Component({
  selector: 'app-question-creator',
  templateUrl: './question-creator.component.html',
  styleUrls: ['./question-creator.component.css']
})
export class QuestionCreatorComponent implements OnInit {
  questions: any[] = [];
  context: { level_tr?: string; class_level?: string; subject_tr?: string; chapter?: string; topic?: string } = {};
  questionHeader = '';
  pageSize = 'A4';
  marginPreset: MarginPreset = 'standard';
  marginTop = 25.4;
  marginRight = 25.4;
  marginBottom = 25.4;
  marginLeft = 25.4;
  questionsPadding = 16;
  questionsGap = 12;

  pageSizes: { value: string; label: string }[] = [
    { value: 'A4', label: 'A4' },
    { value: 'A3', label: 'A3' },
    { value: 'A5', label: 'A5' },
    { value: 'B4', label: 'B4' },
    { value: 'B5', label: 'B5' },
    { value: 'Letter', label: 'Letter' },
    { value: 'Legal', label: 'Legal' },
    { value: 'Tabloid', label: 'Tabloid' },
  ];

  showExportFormatDialog = false;
  exportFormat: ExportFormat = 'both';
  saving = false;
  saveSuccessMessage = '';

  constructor(private router: Router, private apiService: ApiService) {}

  ngOnInit(): void {
    const state = history.state;
    let restored = false;
    if (state?.questions && Array.isArray(state.questions) && state.questions.length > 0) {
      this.questions = state.questions;
      this.context = state.context || {};
      restored = true;
    } else {
      const stored = sessionStorage.getItem(QUESTION_CREATOR_STATE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed?.questions?.length) {
            this.questions = parsed.questions;
            this.context = parsed.context || {};
            if (parsed.questionHeader != null) this.questionHeader = parsed.questionHeader;
            if (parsed.pageSize) this.pageSize = parsed.pageSize;
            if (parsed.marginPreset) this.marginPreset = parsed.marginPreset;
            if (parsed.marginTop != null) this.marginTop = parsed.marginTop;
            if (parsed.marginRight != null) this.marginRight = parsed.marginRight;
            if (parsed.marginBottom != null) this.marginBottom = parsed.marginBottom;
            if (parsed.marginLeft != null) this.marginLeft = parsed.marginLeft;
            if (parsed.questionsPadding != null) this.questionsPadding = parsed.questionsPadding;
            if (parsed.questionsGap != null) this.questionsGap = parsed.questionsGap;
            sessionStorage.removeItem(QUESTION_CREATOR_STATE_KEY);
            restored = true;
          }
        } catch (_) {}
      }
    }
    if (!restored) {
      this.router.navigate(['/question']);
    }
  }

  removeQuestion(id: number): void {
    this.questions = this.questions.filter(q => q.id !== id);
  }

  goBack(): void {
    this.router.navigate(['/question']);
  }

  onSmartQuestionCreator(): void {
    // To be defined later
  }

  onMarginPresetChange(): void {
    if (this.marginPreset === 'narrow') {
      this.marginTop = this.marginRight = this.marginBottom = this.marginLeft = 12.7; // 0.5"
    } else if (this.marginPreset === 'standard') {
      this.marginTop = this.marginRight = this.marginBottom = this.marginLeft = 25.4; // 1"
    } else if (this.marginPreset === 'wide') {
      this.marginTop = 38.1;   // 1.5"
      this.marginRight = 25.4; // 1"
      this.marginBottom = 25.4;
      this.marginLeft = 38.1;  // 1.5"
    }
  }

  get defaultFileNameBase(): string {
    const parts: string[] = [];
    if (this.context.subject_tr) parts.push(this.context.subject_tr.replace(/\s+/g, '_'));
    if (this.context.chapter) parts.push('Chapter_' + String(this.context.chapter).replace(/\s+/g, '_'));
    if (this.context.topic) parts.push(String(this.context.topic).replace(/\s+/g, '_'));
    return parts.length ? parts.join('_') : 'questions';
  }

  get defaultPdfName(): string {
    return this.defaultFileNameBase + '.pdf';
  }

  get defaultDocxName(): string {
    return this.defaultFileNameBase + '.docx';
  }

  /** Preview paper width in px (approximate for A4 at ~96dpi). */
  get previewWidth(): number {
    const w: Record<string, number> = {
      A4: 210, A3: 297, A5: 148, B4: 250, B5: 176,
      Letter: 216, Legal: 216, Tabloid: 279
    };
    return Math.min((w[this.pageSize] || 210) * 0.95, 400);
  }

  save(): void {
    if (!this.apiService.isLoggedIn()) {
      const state = {
        questions: this.questions,
        context: this.context,
        questionHeader: this.questionHeader,
        pageSize: this.pageSize,
        marginPreset: this.marginPreset,
        marginTop: this.marginTop,
        marginRight: this.marginRight,
        marginBottom: this.marginBottom,
        marginLeft: this.marginLeft,
        questionsPadding: this.questionsPadding,
        questionsGap: this.questionsGap,
      };
      sessionStorage.setItem(QUESTION_CREATOR_STATE_KEY, JSON.stringify(state));
      localStorage.setItem('returnUrl', '/question/create');
      this.router.navigate(['/login']);
      return;
    }

    this.apiService.getCustomerSettings().subscribe({
      next: (res) => {
        const format = res.settings?.['export_format'] as ExportFormat | undefined;
        if (format === 'both' || format === 'pdf' || format === 'docx') {
          this.doSave(format);
        } else {
          this.showExportFormatDialog = true;
        }
      },
      error: () => {
        this.showExportFormatDialog = true;
      }
    });
  }

  confirmExportFormat(): void {
    this.apiService.updateCustomerSettings({ export_format: this.exportFormat }).subscribe({
      next: () => {
        this.showExportFormatDialog = false;
        this.doSave(this.exportFormat);
      },
      error: () => {
        this.doSave(this.exportFormat);
      }
    });
  }

  private doSave(format: ExportFormat): void {
    this.saving = true;
    this.saveSuccessMessage = '';
    const payload = {
      questions: this.questions,
      questionHeader: this.questionHeader,
      pageSize: this.pageSize,
      marginTop: this.marginTop,
      marginRight: this.marginRight,
      marginBottom: this.marginBottom,
      marginLeft: this.marginLeft,
      filename: this.defaultFileNameBase,
    };
    const toRequest: ('pdf' | 'docx')[] = [];
    if (format === 'both' || format === 'pdf') toRequest.push('pdf');
    if (format === 'both' || format === 'docx') toRequest.push('docx');
    const requests = toRequest.map(fmt =>
      this.apiService.exportQuestions({ ...payload, format: fmt })
    );
    forkJoin(requests).subscribe({
      next: (blobs) => {
        toRequest.forEach((fmt, i) => this.downloadBlob(blobs[i], fmt === 'pdf' ? this.defaultPdfName : this.defaultDocxName));
        this.saveSuccessMessage = `Created and downloaded: ${toRequest.map(f => f === 'pdf' ? this.defaultPdfName : this.defaultDocxName).join(', ')}. Saved to Created Questions.`;
        this.saving = false;
        this.apiService.createQuestionSet({
          name: this.defaultFileNameBase,
          question_header: this.questionHeader,
          questions: this.questions,
        }).subscribe({ error: () => {} });
      },
      error: () => {
        this.saveSuccessMessage = 'Failed to generate files. Please try again.';
        this.saving = false;
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
