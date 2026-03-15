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
  selectedSubject = '';
  selectedChapter = '';
  downloadingAllPdf = false;

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.load();
  }

  /** Parse name like "Subject_Chapter_No_Topics..." into subject and chapter keys for filtering. */
  getParsed(name: string): { subjectKey: string; chapterKey: string } {
    if (!name || !name.trim()) return { subjectKey: '', chapterKey: '' };
    const n = name.trim();
    const idx = n.search(/_Chapter_/i);
    if (idx < 0) return { subjectKey: n, chapterKey: '' };
    const subjectKey = n.slice(0, idx);
    const after = n.slice(idx + '_Chapter_'.length);
    const chapterKey = after.split('_')[0]?.trim() || '';
    return { subjectKey, chapterKey };
  }

  /** Unique subject keys (for filter dropdown) from current sets. */
  get subjectOptions(): { value: string; label: string }[] {
    const keys = new Set<string>();
    this.sets.forEach(s => {
      const { subjectKey } = this.getParsed(s.name);
      if (subjectKey) keys.add(subjectKey);
    });
    return [{ value: '', label: 'All subjects' }, ...Array.from(keys).sort().map(k => ({ value: k, label: k.replace(/_/g, ' ') }))];
  }

  /** Chapter options: all chapters, or only chapters for selected subject. */
  get chapterOptions(): { value: string; label: string }[] {
    const keys = new Set<string>();
    this.sets.forEach(s => {
      const { subjectKey, chapterKey } = this.getParsed(s.name);
      if (this.selectedSubject && subjectKey !== this.selectedSubject) return;
      if (chapterKey) keys.add(chapterKey);
    });
    return [{ value: '', label: 'All chapters' }, ...Array.from(keys).sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b)).map(k => ({ value: k, label: k }))];
  }

  /** Sets filtered by selected subject and chapter. */
  get filteredSets(): CreatedQuestionSet[] {
    if (!this.selectedSubject && !this.selectedChapter) return this.sets;
    return this.sets.filter(s => {
      const { subjectKey, chapterKey } = this.getParsed(s.name);
      if (this.selectedSubject && subjectKey !== this.selectedSubject) return false;
      if (this.selectedChapter && chapterKey !== this.selectedChapter) return false;
      return true;
    });
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

  /** Download PDF for all currently filtered sets (one after another with short delay). */
  downloadAllPdf(): void {
    const list = this.filteredSets;
    if (!list.length) return;
    this.downloadingAllPdf = true;
    let index = 0;
    const delayMs = 400;
    const doNext = () => {
      if (index >= list.length) {
        this.downloadingAllPdf = false;
        return;
      }
      const set = list[index];
      index += 1;
      const payload = {
        questions: set.questions,
        questionHeader: set.question_header || '',
        pageSize: 'A4',
        marginTop: 25.4,
        marginRight: 25.4,
        marginBottom: 25.4,
        marginLeft: 25.4,
        format: 'pdf' as const,
        filename: set.file_name_base,
      };
      this.apiService.exportQuestions(payload).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = set.file_name_base + '.pdf';
          a.click();
          URL.revokeObjectURL(url);
          setTimeout(doNext, delayMs);
        },
        error: () => {
          setTimeout(doNext, delayMs);
        }
      });
    };
    doNext();
  }
}
