import { AfterViewInit, Component, OnInit, Renderer2 } from '@angular/core';
import { LoadingService } from 'src/app/service/loading.service';
import { FAQ_CHAPTERS, FaqChapter, FaqEntry } from '../faqs/faq-content';

interface SupportMessage {
  role: 'bot' | 'user';
  text: string;
  label?: string;
}

interface FaqHit {
  chapter: FaqChapter;
  entry: FaqEntry;
  score: number;
}

type SupportStage = 'bot' | 'refine' | 'escalate';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  standalone: false,
})
export class ChatComponent implements OnInit, AfterViewInit {
  readonly chapters = FAQ_CHAPTERS;
  readonly totalAnswers = FAQ_CHAPTERS.reduce((total, chapter) => total + chapter.entries.length, 0);

  question = '';
  messages: SupportMessage[] = [{
    role: 'bot',
    label: 'Cheradip Support Bot',
    text: 'Assalamu Alaikum! Ask a question about Cheradip, any product subdomain, accounts, study, exams, packages, AI services, payments, referrals, withdrawal, or shopping. I will find the closest reviewed answer first.',
  }];
  suggestions: FaqHit[] = [];
  awaitingSatisfaction = false;
  stage: SupportStage = 'bot';
  refinementAnswerPresented = false;
  humanChannelRequested = false;

  selectedChapterId = '';
  selectedTopic = '';
  selectedSubtopic = '';
  selectedTags = new Set<string>();

  constructor(private renderer: Renderer2, private loadingService: LoadingService) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) searchBarElement.style.display = 'block';
    this.suggestions = this.defaultSuggestions();
  }

  ngAfterViewInit(): void {
    const signMenu = document.getElementById('sign_menu');
    if (signMenu) this.renderer.setStyle(signMenu, 'display', 'flex');
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  ask(): void {
    const query = this.question.trim();
    if (!query) return;
    this.question = '';
    this.messages.push({ role: 'user', text: query });
    this.answerFromKnowledge(query, false);
  }

  askSuggestion(hit: FaqHit): void {
    this.messages.push({ role: 'user', text: hit.entry.question });
    this.presentEntry(hit, false);
  }

  chooseRefinedAnswer(hit: FaqHit): void {
    this.messages.push({ role: 'user', text: hit.entry.question });
    this.presentEntry(hit, true);
    this.stage = 'bot';
  }

  rateAnswer(satisfied: boolean): void {
    this.awaitingSatisfaction = false;
    if (satisfied) {
      this.messages.push({ role: 'user', text: 'Yes, this answered my question.' });
      this.messages.push({ role: 'bot', label: 'Resolved', text: 'Great. The answer remains above for reference. You can ask another question at any time.' });
      this.stage = 'bot';
      this.refinementAnswerPresented = false;
      this.suggestions = this.defaultSuggestions();
      return;
    }

    this.messages.push({ role: 'user', text: 'No, I still need help.' });
    if (this.refinementAnswerPresented) {
      this.stage = 'escalate';
      this.messages.push({ role: 'bot', label: 'Human support', text: 'The guided knowledge search did not solve this issue. Continue to the human-support handoff below.' });
    } else {
      this.stage = 'refine';
      this.messages.push({ role: 'bot', label: 'Refine the issue', text: 'Choose a main chapter, topic, subtopic, and any useful tags. Matching reviewed answers will appear in the scrollable results window.' });
    }
  }

  selectChapter(chapterId: string): void {
    this.selectedChapterId = chapterId;
    this.selectedTopic = '';
    this.selectedSubtopic = '';
    this.selectedTags.clear();
  }

  selectTopic(topic: string): void {
    this.selectedTopic = topic;
    this.selectedSubtopic = '';
    this.selectedTags.clear();
  }

  selectSubtopic(subtopic: string): void {
    this.selectedSubtopic = subtopic;
    this.selectedTags.clear();
  }

  toggleTag(tag: string): void {
    const next = new Set(this.selectedTags);
    next.has(tag) ? next.delete(tag) : next.add(tag);
    this.selectedTags = next;
  }

  resetRefinement(): void {
    this.selectedChapterId = '';
    this.selectedTopic = '';
    this.selectedSubtopic = '';
    this.selectedTags.clear();
  }

  requestHumanSupport(): void {
    this.humanChannelRequested = true;
    this.messages.push({
      role: 'bot',
      label: 'Handoff saved',
      text: 'The handoff point is ready. Direct Cheradip-app and WhatsApp conversations will be connected in the next live-support implementation. No message has been sent yet.',
    });
  }

  get topicOptions(): string[] {
    const chapter = this.selectedChapter;
    if (!chapter) return [];
    return this.unique(chapter.entries.map(entry => entry.topic || entry.question));
  }

  get subtopicOptions(): string[] {
    if (!this.selectedTopic) return [];
    return this.unique(this.entriesForSelection
      .filter(entry => (entry.topic || entry.question) === this.selectedTopic)
      .map(entry => entry.subtopic || 'Direct answer'));
  }

  get tagOptions(): string[] {
    if (!this.selectedSubtopic) return [];
    const tags = this.entriesForSelection
      .filter(entry => (entry.topic || entry.question) === this.selectedTopic)
      .filter(entry => (entry.subtopic || 'Direct answer') === this.selectedSubtopic)
      .flatMap(entry => entry.tags || []);
    return this.unique(tags).slice(0, 24);
  }

  get refinedResults(): FaqHit[] {
    const chapter = this.selectedChapter;
    if (!chapter || !this.selectedTopic || !this.selectedSubtopic) return [];
    const selectedTags = Array.from(this.selectedTags);
    return chapter.entries
      .filter(entry => (entry.topic || entry.question) === this.selectedTopic)
      .filter(entry => (entry.subtopic || 'Direct answer') === this.selectedSubtopic)
      .filter(entry => !selectedTags.length || selectedTags.every(tag => entry.tags?.includes(tag)))
      .map(entry => ({ chapter, entry, score: 1 }));
  }

  get selectedChapter(): FaqChapter | undefined {
    return this.chapters.find(chapter => chapter.id === this.selectedChapterId);
  }

  trackMessage(index: number): number { return index; }
  trackHit(_index: number, hit: FaqHit): string { return hit.entry.id; }
  trackText(_index: number, value: string): string { return value; }

  private get entriesForSelection(): FaqEntry[] {
    return this.selectedChapter?.entries || [];
  }

  private answerFromKnowledge(query: string, refined: boolean): void {
    const hits = this.findMatches(query, 7);
    if (!hits.length) {
      this.messages.push({
        role: 'bot',
        label: 'No confident match',
        text: 'I could not find a reliable direct match. Use the guided chapter and topic selection so I can narrow the knowledge base without guessing.',
      });
      this.suggestions = this.defaultSuggestions();
      this.awaitingSatisfaction = false;
      this.stage = 'refine';
      return;
    }
    this.presentEntry(hits[0], refined);
    this.suggestions = hits.slice(1, 6);
  }

  private presentEntry(hit: FaqHit, refined: boolean): void {
    this.messages.push({ role: 'bot', label: hit.chapter.title, text: hit.entry.answer });
    this.awaitingSatisfaction = true;
    this.refinementAnswerPresented = refined;
    this.suggestions = this.findMatches(hit.entry.question, 6)
      .filter(candidate => candidate.entry.id !== hit.entry.id)
      .slice(0, 5);
    setTimeout(() => document.querySelector('.support-satisfaction')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  private findMatches(query: string, limit: number): FaqHit[] {
    const normalizedQuery = this.normalize(query);
    const queryTokens = this.tokens(query);
    if (!normalizedQuery || !queryTokens.length) return [];

    return this.chapters.flatMap(chapter => chapter.entries.map(entry => {
      const question = this.normalize(entry.question);
      const searchable = this.normalize([
        entry.question, entry.answer, entry.keywords || '', entry.topic || '', entry.subtopic || '',
        ...(entry.tags || []), chapter.title, chapter.summary,
      ].join(' '));
      const searchableTokens = new Set(this.tokens(searchable));
      let score = 0;
      if (question === normalizedQuery) score += 120;
      if (question.includes(normalizedQuery)) score += 65;
      if (searchable.includes(normalizedQuery)) score += 35;
      for (const token of queryTokens) {
        if (searchableTokens.has(token)) score += token.length >= 5 ? 9 : 5;
        else if (searchable.includes(token)) score += 2;
      }
      score += Math.round((queryTokens.filter(token => searchableTokens.has(token)).length / queryTokens.length) * 25);
      return { chapter, entry, score };
    }))
      .filter(hit => hit.score >= 10)
      .sort((a, b) => b.score - a.score || a.entry.question.length - b.entry.question.length)
      .slice(0, limit);
  }

  private defaultSuggestions(): FaqHit[] {
    const ids = ['where-start', 'student-free', 'find-questions', 'exam-types', 'tutor-start', 'add-money'];
    return ids.map(id => {
      for (const chapter of this.chapters) {
        const entry = chapter.entries.find(item => item.id === id);
        if (entry) return { chapter, entry, score: 1 };
      }
      return undefined;
    }).filter((hit): hit is FaqHit => !!hit);
  }

  private normalize(value: string): string {
    return String(value || '').toLocaleLowerCase().replace(/[^a-z0-9\u0980-\u09ff/.-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private tokens(value: string): string[] {
    return this.normalize(value).split(' ').filter(token => token.length > 1);
  }

  private unique(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }
}
