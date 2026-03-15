import { Component, OnInit } from '@angular/core';
import { ApiService, CreatedQuestionSet } from '../../../service/api.service';

@Component({
  selector: 'app-created-questions',
  templateUrl: './created-questions.component.html',
  styleUrls: ['./created-questions.component.css']
})
export class CreatedQuestionsComponent implements OnInit {
  sets: CreatedQuestionSet[] = [];
  loading = true;
  error = '';
  renamingId: number | null = null;
  renameValue = '';

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.apiService.getCreatedQuestionSets().subscribe({
      next: (list) => {
        this.sets = list || [];
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load created questions.';
        this.loading = false;
      }
    });
  }

  startRename(set: CreatedQuestionSet): void {
    this.renamingId = set.id;
    this.renameValue = set.name;
  }

  cancelRename(): void {
    this.renamingId = null;
    this.renameValue = '';
  }

  saveRename(): void {
    if (this.renamingId == null) return;
    const name = this.renameValue.trim() || 'questions';
    this.apiService.renameQuestionSet(this.renamingId, name).subscribe({
      next: () => {
        const s = this.sets.find(x => x.id === this.renamingId);
        if (s) {
          s.name = name;
          s.file_name_base = name.replace(/\s+/g, '_') + '_' + s.counter;
        }
        this.cancelRename();
      },
      error: () => {}
    });
  }

  deleteSet(set: CreatedQuestionSet): void {
    if (!confirm('Delete this saved question set?')) return;
    this.apiService.deleteQuestionSet(set.id).subscribe({
      next: () => this.load(),
      error: () => {}
    });
  }

  downloadSet(set: CreatedQuestionSet, format: 'pdf' | 'docx'): void {
    const payload = {
      questions: set.questions,
      questionHeader: set.question_header || '',
      pageSize: 'A4',
      marginTop: 25.4,
      marginRight: 25.4,
      marginBottom: 25.4,
      marginLeft: 25.4,
      format,
      filename: set.file_name_base,
    };
    this.apiService.exportQuestions(payload).subscribe({
      next: (blob) => {
        const ext = format === 'pdf' ? '.pdf' : '.docx';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = set.file_name_base + ext;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {}
    });
  }
}
