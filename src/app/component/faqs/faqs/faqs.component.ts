import { AfterViewInit, Component, HostListener, OnInit, Renderer2 } from '@angular/core';
import { LoadingService } from 'src/app/service/loading.service';
import { FAQ_CHAPTERS, FAQ_TYPE_OPTIONS, FaqChapter, FaqEntry, FaqMainType } from './faq-content';

interface FilteredChapter extends FaqChapter {
  visibleEntries: FaqEntry[];
}

@Component({
  selector: 'app-faqs',
  templateUrl: './faqs.component.html',
  styleUrls: ['./faqs.component.css'],
  standalone: false,
})
export class FaqsComponent implements OnInit, AfterViewInit {
  readonly chapters = FAQ_CHAPTERS;
  readonly typeOptions = FAQ_TYPE_OPTIONS;
  selectedType: 'all' | FaqMainType = 'all';
  selectedChapter = 'all';
  searchTerm = '';
  sidebarOpen = true;
  expandedIds = new Set<string>();

  constructor(private renderer: Renderer2, private loadingService: LoadingService) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) searchBarElement.style.display = 'block';
    this.sidebarOpen = window.innerWidth >= 1024;
  }

  ngAfterViewInit(): void {
    const signMenu = document.getElementById('sign_menu');
    if (signMenu) this.renderer.setStyle(signMenu, 'display', 'flex');
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (window.innerWidth >= 1024) this.sidebarOpen = true;
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (window.innerWidth < 1024) this.sidebarOpen = false;
  }

  get filteredChapters(): FilteredChapter[] {
    const query = this.normalise(this.searchTerm);
    return this.chapters
      .filter(chapter => this.selectedChapter === 'all' || chapter.id === this.selectedChapter)
      .map(chapter => ({
        ...chapter,
        visibleEntries: chapter.entries.filter(entry => {
          const matchesType = this.selectedType === 'all' || entry.types.includes(this.selectedType);
          if (!matchesType) return false;
          if (!query) return true;
          return this.normalise([
            entry.question, entry.answer, entry.note || '', entry.keywords || '',
            ...(entry.steps || []), chapter.title, chapter.summary,
          ].join(' ')).includes(query);
        }),
      }))
      .filter(chapter => chapter.visibleEntries.length > 0);
  }

  get resultCount(): number {
    return this.filteredChapters.reduce((count, chapter) => count + chapter.visibleEntries.length, 0);
  }

  get totalCount(): number {
    return this.chapters.reduce((count, chapter) => count + chapter.entries.length, 0);
  }

  get hasFilters(): boolean {
    return this.selectedType !== 'all' || this.selectedChapter !== 'all' || !!this.searchTerm.trim();
  }

  selectType(type: 'all' | FaqMainType): void {
    this.selectedType = type;
    this.pruneExpandedEntries();
  }

  selectChapter(chapterId: string): void {
    this.selectedChapter = chapterId;
    this.pruneExpandedEntries();
    if (window.innerWidth < 1024) this.sidebarOpen = false;
    setTimeout(() => document.getElementById('manual-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  clearFilters(): void {
    this.selectedType = 'all';
    this.selectedChapter = 'all';
    this.searchTerm = '';
    this.expandedIds.clear();
  }

  toggleEntry(entryId: string): void {
    const next = new Set(this.expandedIds);
    next.has(entryId) ? next.delete(entryId) : next.add(entryId);
    this.expandedIds = next;
  }

  isExpanded(entryId: string): boolean { return this.expandedIds.has(entryId); }

  toggleAll(): void {
    const ids = this.filteredChapters.flatMap(chapter => chapter.visibleEntries.map(entry => entry.id));
    const allOpen = ids.length > 0 && ids.every(id => this.expandedIds.has(id));
    this.expandedIds = allOpen ? new Set<string>() : new Set(ids);
  }

  get allVisibleExpanded(): boolean {
    const ids = this.filteredChapters.flatMap(chapter => chapter.visibleEntries.map(entry => entry.id));
    return ids.length > 0 && ids.every(id => this.expandedIds.has(id));
  }

  printManual(): void {
    const previous = this.expandedIds;
    this.expandedIds = new Set(this.chapters.flatMap(chapter => chapter.entries.map(entry => entry.id)));
    setTimeout(() => {
      window.print();
      this.expandedIds = previous;
    }, 80);
  }

  trackChapter(_index: number, chapter: FaqChapter): string { return chapter.id; }
  trackEntry(_index: number, entry: FaqEntry): string { return entry.id; }

  pruneExpandedEntries(): void {
    const visible = new Set(this.filteredChapters.flatMap(chapter => chapter.visibleEntries.map(entry => entry.id)));
    this.expandedIds = new Set(Array.from(this.expandedIds).filter(id => visible.has(id)));
  }

  private normalise(value: string): string {
    return String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  }
}
