import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, ElementRef, ViewChildren, QueryList, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../../service/api.service';
import { formatMaybeCProgramQuestionText } from '../../../shared/c-program-question-format';
import { LoadingService } from '../../../service/loading.service';
import { DisappearedQuestionsService } from '../../../service/disappeared-questions.service';
import { diffChars } from 'diff';

/** Exam keys aligned with question-creator structured header (BN labels on /question modal). */
const SMART_CREATOR_EXAM_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'election', label: 'নির্বাচনী পরীক্ষা' },
  { key: 'pre_election', label: 'প্রাক-নির্বাচনী পরীক্ষা' },
  { key: 'yearly', label: 'বার্ষিক পরীক্ষা' },
  
  { key: 'half_yearly', label: 'অর্ধবার্ষিক পরীক্ষা' },
  { key: 'term1', label: '১ম সাময়িক পরীক্ষা' },
  { key: 'term2', label: '২য় সাময়িক পরীক্ষা' },
  { key: 'special', label: 'বিশেষ পরীক্ষা' },
  { key: 'model', label: 'মডেল টেস্ট' },
  { key: 'class_test', label: 'ক্লাস টেস্ট' },
];

const SMART_CREATOR_SET_LETTERS = ['ক', 'খ', 'গ', 'ঘ'] as const;
type SmartCreatorSetLetter = (typeof SMART_CREATOR_SET_LETTERS)[number];

/** Prefix + base64(UTF-8 plain); approve path reads this in database_admin_views._strip_red_markup. */
const CERADIP_PLAIN_PREFIX = '<!--CERADIP_PLAIN:';

function utf8ToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

/** Level from question_levels API; sort_order = class_level number for ordering. */
export interface QuestionLevel {
  level: string;
  level_tr: string;
  label: string;
  sort_order?: number;
}

/** Subject from question_subjects API (cheradip_hsc.cheradip_subject). */
export interface QuestionSubject {
  level_tr: string;
  class_level: string;
  subject_tr: string;
  id: string;
  name: string;
  /** Display name from DB (may be empty; then use subject_tr). */
  subject_name?: string;
  /** Institute / curriculum subject code from cheradip_subject. */
  subject_code?: string;
  sq?: number;
}

@Component({
  selector: 'app-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.css']
})
export class QuestionComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Current subject slug for route (subject_tr). */
  currentSubject: string = '';
  currentChapter: string = '';
  questions: any[] = [];
  /** Levels from cheradip_hsc (first dropdown). */
  levels: QuestionLevel[] = [];
  /** Selected level (level_tr). */
  selectedLevel: string = '';
  /** Classes for selected level (show dropdown only if classes.length > 1). */
  classes: Array<{ value: string; label: string }> = [];
  selectedClass: string = '';
  /** Groups from cheradip_subject.groups (show only if groups.length > 0). */
  groups: string[] = [];
  selectedGroup: string = '';
  subjects: QuestionSubject[] = [];
  /** True while question_subjects request is in flight (show subject control anyway). */
  subjectListLoading = false;
  /** Single subject selection. */
  selectedSubjectTr: string = '';
  chapters: Array<{ id: string; name: string; chapter_no?: string | null }> = [];
  /** Multi-select: chapter ids. */
  selectedChapterIds: Set<string> = new Set();
  chapterDropdownOpen = false;
  levelDropdownOpen = false;
  classDropdownOpen = false;
  groupDropdownOpen = false;
  subjectDropdownOpen = false;
  /** Topics from subject table (by chapter_no then topic_no when multiple chapters). */
  topics: Array<{ id: string; name: string; topic_no?: string | null }> = [];
  /** Multi-select: topic ids. */
  selectedTopicIds: Set<string> = new Set();
  topicDropdownOpen = false;
  /** Multi-select question type filter (e.g. সৃজনশীল প্রশ্ন, বহুনির্বাচনি প্রশ্ন). */
  selectedQuestionTypes: Set<string> = new Set();
  typeDropdownOpen = false;
  /** Smart Question Creator: modal for EIIN / exam / set before navigating to `/question/create`. */
  smartCreatorModalOpen = false;
  smartCreatorModalEiin = '000000';
  smartCreatorModalExamKey = 'election';
  smartCreatorModalSetLetter: SmartCreatorSetLetter | null = null;
  smartCreatorModalError = '';
  readonly smartCreatorExamOptions = SMART_CREATOR_EXAM_OPTIONS;
  readonly smartCreatorSetLetters = SMART_CREATOR_SET_LETTERS;
  get primarySubject(): QuestionSubject | null {
    if (!this.subjects.length || !this.selectedSubjectTr) return null;
    return this.subjects.find(s => s.subject_tr === this.selectedSubjectTr) || null;
  }

  /**
   * Pass API `name` and `subject_name` into creator context (same shape as question_subjects rows).
   */
  private subjectMetaForCreateContext(sub: QuestionSubject | null | undefined): {
    name?: string;
    subject_name?: string;
  } {
    if (!sub) return {};
    const apiName = (sub.name || '').trim();
    const apiSn = (sub.subject_name || '').trim();
    const display = apiSn || apiName;
    if (!display) return {};
    return {
      name: (apiName || display).trim(),
      subject_name: display,
    };
  }
  /** Backing store when not using 999 cache; when using cache, topicQuestions getter returns from cache. */
  private _topicQuestionsLegacy: any[] = [];
  /** Questions for selected topic (from HSC subject table); user can select which to use. */
  get topicQuestions(): any[] {
    if (this.topicQuestionsFullCache.length > 0) return this.getTopicQuestionsFilteredSorted();
    return this._topicQuestionsLegacy;
  }
  topicQuestionsLoaded = false;
  /** More Filters: parsed Source (e.g. ChB) and Year (e.g. 18); two-column filter. */
  subsourceSources: string[] = [];
  subsourceYears: string[] = [];
  selectedSources: Set<string> = new Set();
  selectedYears: Set<string> = new Set();
  moreFiltersOpen = false;
  /** Institute type filter: dropdown from cheradip_source; limits which sources appear in Source column. */
  cheradipInstitutes: Array<{ institute_code: string; institute_name: string; institute_type: string }> = [];
  instituteTypeByCode: Map<string, string> = new Map();
  instituteTypes: string[] = [];
  selectedInstituteType: string | null = null;
  instituteTypeDropdownOpen = false;
  /** Topics for the current chapter when in form mode (new question); used by question form dropdown. */
  formTopics: Array<{ id: string; name: string; topic_no?: string }> = [];
  /** Set of question id (from topicQuestions) that user has selected. */
  /** Set of question qid (from topicQuestions). */
  selectedQuestionIds: Set<number | string> = new Set();
  /** Qid currently in inline-edit mode (change icon). */
  editingQid: number | string | null = null;
  /** Inline-edit form values (question text, option_1..4). */
  editForm: { question: string; option_1: string; option_2: string; option_3: string; option_4: string } = { question: '', option_1: '', option_2: '', option_3: '', option_4: '' };
  /** Success alert (same app-alert as Apply Token): message and visibility. */
  successAlertMessage = '';
  showSuccessAlert = false;
  /** Disappear feedback (snackbar like Apply Token). */
  disappearAlertMessage = '';
  showDisappearAlert = false;
  /** Loved/favourite qids (client-side only). */
  lovedQids: Set<number | string> = new Set();
  currentPage: number = 1;
  totalPages: number = 1;
  breadcrumbItems: any[] = [];
  isFormMode: boolean = false;
  isEditRoute: boolean = false;
  editQuestion: any | null = null;

  @ViewChildren('filterItem') filterItems!: QueryList<ElementRef<HTMLElement>>;

  /** Layout per question index: '1row' | '2row' | '4row' based on content width. */
  optionsLayouts: ('1row' | '2row' | '4row')[] = [];
  private readonly OPTIONS_GAP_PX = 24;

  /** localStorage key for persisting filter selections across reload/navigation. */
  private readonly FILTER_STORAGE_KEY = 'cheradip_question_filter_state';
  /** Applied during init restore; cleared after apply or on error. */
  private _pendingFilterState: { level?: string; class?: string; group?: string; subject?: string; chapterIds?: string[]; topicIds?: string[]; sources?: string[]; years?: string[]; types?: string[]; instituteType?: string | null; questionIds?: (number | string)[] } | null = null;
  /** After subject load from URL matching saved state, run applyRestoreFiltersAndBuild999 instead of default build999. */
  private _restoreChapterTopicAfterSubjectLoad = false;

  /** 999-question cache: prefix for localStorage keys (filter-dependent). */
  private readonly Q999_CACHE_PREFIX = 'cheradip_q999_';
  /** Subject-level cache prefix: all questions for a subject (for fast total y and reuse). */
  private readonly SUBJECT_CACHE_PREFIX = 'cheradip_subject_all_';
  /** Chunk size for storing full subject question list in localStorage. */
  private readonly SUBJECT_LIST_CHUNK_SIZE = 500;
  private readonly Q999_PAGE_SIZE = 30;
  private readonly Q999_CHUNK_SIZE = 100;
  private readonly Q999_MAX = 999;
  /** Total questions in DB for current subject (y). Set from API when available; otherwise null → show "?". */
  totalQuestionsInDbForSubject: number | null = null;
  /** Cache in retrieval order; filled from localStorage in chunks. */
  private topicQuestionsFullCache: any[] = [];
  /** How many items from cache we have loaded so far (100, 200, ... up to 999). */
  private topicQuestionsLoadedCount = 0;
  /** Total count stored in cache (from meta); used for pagination and loading next chunks. */
  private topicQuestionsCacheTotal = 0;
  /** Current page of topic-questions list (1-based). */
  topicQuestionsPage = 1;
  /** Shown once when user reaches last page with 999 questions. */
  private _hasShown999LimitAlert = false;
  /** In-memory subject cache: chapterId -> topicId -> questions[]. Filled when subject is loaded (API or localStorage). */
  private subjectCacheByChapter: { [chapterId: string]: { [topicId: string]: any[] } } = {};

  /** x = number of questions currently retrieved (capped at 999). */
  get retrievedCount(): number {
    if (this.topicQuestionsFullCache.length > 0 && this.topicQuestionsCacheTotal > 0)
      return Math.min(this.Q999_MAX, this.topicQuestionsCacheTotal);
    return Math.min(this.Q999_MAX, this._topicQuestionsLegacy?.length ?? 0);
  }

  /** Actual number of questions in current selection. When more filters (source/year) applied, returns filtered count; else returns full count from subject cache (not capped at 999). Shown as middle number in "X Selected of Y of Total Z". User can navigate through up to 999 loaded questions. */
  get totalQuestionsInCurrentSelection(): number {
    if (
      this.selectedSources.size > 0 ||
      this.selectedYears.size > 0 ||
      this.selectedQuestionTypes.size > 0
    ) {
      const filtered = this.getTopicQuestionsFilteredSorted();
      return filtered.length;
    }
    if (Object.keys(this.subjectCacheByChapter).length > 0) {
      const chapterIds = this.selectedChapterIds.size > 0
        ? Array.from(this.selectedChapterIds).filter(id => this.subjectCacheByChapter[id])
        : Object.keys(this.subjectCacheByChapter);
      if (chapterIds.length === 0) return this.totalQuestionsInDbForSubject ?? 0;
      const seen = new Set<number | string>();
      chapterIds.forEach(chapterId => {
        const topicsMap = this.subjectCacheByChapter[chapterId] || {};
        const topicIds = this.selectedTopicIds.size > 0
          ? Object.keys(topicsMap).filter(tid => Array.from(this.selectedTopicIds).some(id => id == tid))
          : Object.keys(topicsMap);
        topicIds.forEach(topicId => {
          (topicsMap[topicId] || []).forEach((q: any) => { if (q?.qid != null) seen.add(q.qid); });
        });
      });
      return seen.size;
    }
    if (this.totalQuestionsInDbForSubject != null) return this.totalQuestionsInDbForSubject;
    const filtered = this.getTopicQuestionsFilteredSorted();
    return filtered.length;
  }

  /** Total pages for topic questions (30 per page). Based on filtered list so pagination reflects current filters. */
  get topicQuestionsTotalPages(): number {
    const list = this.getTopicQuestionsFilteredSorted();
    return Math.max(1, Math.ceil(list.length / this.Q999_PAGE_SIZE));
  }

  /** Current page clamped to valid range (1..totalPages) so filters reducing pages don't show empty or "Page 5 of 2". */
  get effectiveTopicQuestionsPage(): number {
    const total = this.topicQuestionsTotalPages;
    return Math.min(Math.max(1, this.topicQuestionsPage), total);
  }

  /** Build localStorage key for 999 cache from current filter state. */
  private buildQ999CacheKey(): string {
    const sub = this.primarySubject;
    if (!sub) return '';
    const ch = Array.from(this.selectedChapterIds).sort().join(',');
    const top = Array.from(this.selectedTopicIds).sort().join(',');
    return `${this.Q999_CACHE_PREFIX}${sub.level_tr}_${sub.class_level}_${sub.subject_tr}_ch${ch}_top${top}`;
  }

  /** Build localStorage key for subject-level cache (all questions for subject). */
  private buildSubjectCacheKey(): string {
    const sub = this.primarySubject;
    if (!sub) return '';
    return `${this.SUBJECT_CACHE_PREFIX}${sub.level_tr}_${sub.class_level}_${sub.subject_tr}`;
  }

  /**
   * Try to load full subject cache from localStorage. Prefers flat list format (_list_meta + _list_chunk_*), then by-chapter format.
   * Returns true if loaded and subjectCacheByChapter/topics/total set.
   */
  private tryLoadSubjectCacheFromStorage(): boolean {
    const sub = this.primarySubject;
    if (!sub || !this.chapters?.length) return false;
    const keyBase = this.buildSubjectCacheKey();
    if (!keyBase) return false;
    try {
      const listMetaStr = localStorage.getItem(`${keyBase}_list_meta`);
      const listMeta = listMetaStr ? JSON.parse(listMetaStr) : null;
      if (listMeta && typeof listMeta.total === 'number' && listMeta.total >= 0) {
        const chunks: any[] = [];
        const chunkCount = listMeta.chunkCount ?? Math.ceil(listMeta.total / this.SUBJECT_LIST_CHUNK_SIZE);
        for (let i = 0; i < chunkCount; i++) {
          const str = localStorage.getItem(`${keyBase}_list_chunk_${i}`);
          const chunk = str ? JSON.parse(str) : null;
          if (Array.isArray(chunk)) chunks.push(...chunk);
        }
        if (chunks.length > 0) {
          const { byChapter, topics } = this.buildByChapterFromFlatList(chunks);
          this.subjectCacheByChapter = byChapter;
          this.topics = topics;
          this.totalQuestionsInDbForSubject = this.countUniqueQidsInByChapter(byChapter);
          this.applyTopicsFromSubjectCache();
          return true;
        }
      }
      const metaStr = localStorage.getItem(`${keyBase}_meta`);
      const meta = metaStr ? JSON.parse(metaStr) : null;
      if (!meta?.chapterIds?.length) return false;
      const byChapter: { [chapterId: string]: { [topicId: string]: any[] } } = {};
      for (const chId of meta.chapterIds as string[]) {
        const chStr = localStorage.getItem(`${keyBase}_ch_${chId}`);
        const chData = chStr ? JSON.parse(chStr) : null;
        if (!chData?.topics) continue;
        byChapter[chId] = chData.topics;
      }
      const seenQids = new Set<number | string>();
      Object.values(byChapter).forEach(topics => {
        Object.values(topics).forEach((arr: any[]) => {
          (arr || []).forEach((q: any) => { if (q?.qid != null) seenQids.add(q.qid); });
        });
      });
      this.subjectCacheByChapter = byChapter;
      this.totalQuestionsInDbForSubject = seenQids.size;
      this.applyTopicsFromSubjectCache();
      return true;
    } catch {
      return false;
    }
  }

  /** Get chapter id for a question (match by id, no, or name). Requires this.chapters to be set. */
  private getChapterIdForQuestion(q: any): string | null {
    if (!this.chapters?.length) return null;
    const id = q?.chapter_id ?? q?.chapter_no ?? q?.chapter;
    const name = q?.chapter_name ?? q?.chapter;
    for (const c of this.chapters) {
      if (c.id == id || c.id === name || (c.name && (c.name === name || c.name === id))) return c.id;
    }
    if (id != null && String(id).trim() !== '') return String(id);
    if (name != null && String(name).trim() !== '') return String(name);
    return null;
  }

  /** Get chapter id from question data only (no dependency on this.chapters). Use when building cache from flat list. */
  private getChapterIdFromQuestionData(q: any): string | null {
    const id = q?.chapter_id ?? q?.chapter_no ?? q?.chapter;
    const name = q?.chapter_name ?? q?.chapter;
    if (id != null && String(id).trim() !== '') return String(id);
    if (name != null && String(name).trim() !== '') return String(name);
    return null;
  }

  /** Get topic id for a question (use topic_id, topic_no, or topic_name as id). */
  private getTopicIdForQuestion(q: any): string {
    const t = q?.topic_id ?? q?.topic_no ?? q?.topic_name ?? q?.topic;
    return t != null ? String(t) : '';
  }

  /** Sort chapters by chapter_no (numeric) then by id/name. */
  private sortChaptersByNo(chapters: Array<{ id: string; name: string; chapter_no?: string | null }>): void {
    chapters.sort((a, b) => {
      const aNo = a.chapter_no ?? a.id ?? '';
      const bNo = b.chapter_no ?? b.id ?? '';
      const na = Number(aNo);
      const nb = Number(bNo);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return (aNo + '').localeCompare(bNo + '', undefined, { numeric: true }) || (a.name || '').localeCompare(b.name || '');
    });
  }

  /** chapter_no from first question in subject cache bucket (for ordering when this.chapters not synced). */
  private getChapterSortKeyFromCache(chId: string): string {
    const tm = this.subjectCacheByChapter[chId];
    if (!tm) return chId;
    const fk = Object.keys(tm)[0];
    const firstQ = fk ? (tm[fk] || [])[0] : null;
    if (firstQ?.chapter_no != null && String(firstQ.chapter_no).trim() !== '') return String(firstQ.chapter_no);
    return chId;
  }

  /** Order chapter ids ascending by chapter_no (uses this.chapters, then cache). */
  private orderChapterIdsForTopics(chapterIds: string[]): string[] {
    if (chapterIds.length <= 1) return chapterIds.slice();
    return chapterIds.slice().sort((a, b) => {
      const chA = this.chapters?.find(c => c.id == a);
      const chB = this.chapters?.find(c => c.id == b);
      const noA =
        chA?.chapter_no != null && String(chA.chapter_no).trim() !== ''
          ? String(chA.chapter_no)
          : this.getChapterSortKeyFromCache(a);
      const noB =
        chB?.chapter_no != null && String(chB.chapter_no).trim() !== ''
          ? String(chB.chapter_no)
          : this.getChapterSortKeyFromCache(b);
      const cmp = noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return String(a).localeCompare(String(b));
    });
  }

  /** Order chapter keys from a byChapter map by chapter_no on first question in each chapter. */
  private orderChapterKeysFromByChapter(
    chapterKeys: string[],
    byChapter: { [chapterId: string]: { [topicId: string]: any[] } }
  ): string[] {
    if (chapterKeys.length <= 1) return chapterKeys.slice();
    const resolveNo = (chId: string): string => {
      const tm = byChapter[chId];
      if (!tm) return chId;
      const fk = Object.keys(tm)[0];
      const firstQ = fk ? (tm[fk] || [])[0] : null;
      if (firstQ?.chapter_no != null && String(firstQ.chapter_no).trim() !== '') return String(firstQ.chapter_no);
      return chId;
    };
    return chapterKeys.slice().sort((a, b) => {
      const cmp = resolveNo(a).localeCompare(resolveNo(b), undefined, { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return String(a).localeCompare(String(b));
    });
  }

  /** Smallest topic_no among candidates (natural order) for stable ascending sort. */
  private pickBestTopicNo(rows: { topic_no?: string | number | null }[]): string | undefined {
    let best: string | undefined;
    for (const r of rows) {
      const tn = r?.topic_no;
      if (tn == null || tn === '') continue;
      const s = String(tn).trim();
      if (!s) continue;
      if (best === undefined) best = s;
      else if (best.localeCompare(s, undefined, { numeric: true, sensitivity: 'base' }) > 0) best = s;
    }
    return best;
  }

  /** Sort topics by topic_no ascending (natural), then name. Prefer topic_no over id when present. */
  private sortTopicsByNo(topics: Array<{ id: string; name: string; topic_no?: string | null }>): void {
    topics.sort((a, b) => {
      const aHas = a.topic_no != null && String(a.topic_no).trim() !== '';
      const bHas = b.topic_no != null && String(b.topic_no).trim() !== '';
      const aNo = aHas ? String(a.topic_no) : String(a.id ?? '');
      const bNo = bHas ? String(b.topic_no) : String(b.id ?? '');
      const byNo = aNo.localeCompare(bNo, undefined, { numeric: true, sensitivity: 'base' });
      if (byNo !== 0) return byNo;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  /** Build byChapter and topics list from flat question array. Uses question data only for chapter id so it works when this.chapters is not yet set. */
  private buildByChapterFromFlatList(questions: any[]): { byChapter: { [chapterId: string]: { [topicId: string]: any[] } }; topics: Array<{ id: string; name: string; topic_no?: string | null }> } {
    const byChapter: { [chapterId: string]: { [topicId: string]: any[] } } = {};
    const topicMap = new Map<string, { name: string; topic_no?: string }>();
    (questions || []).forEach(q => {
      const chId = this.getChapterIdFromQuestionData(q);
      const topicId = this.getTopicIdForQuestion(q);
      if (!chId || topicId === '') return;
      if (!byChapter[chId]) byChapter[chId] = {};
      if (!byChapter[chId][topicId]) byChapter[chId][topicId] = [];
      byChapter[chId][topicId].push(q);
      const name = q?.topic_name ?? q?.topic ?? topicId;
      const topicNo = q?.topic_no != null ? String(q.topic_no) : undefined;
      if (!topicMap.has(topicId)) {
        topicMap.set(topicId, { name, topic_no: topicNo });
      } else {
        const ex = topicMap.get(topicId)!;
        const merged = this.pickBestTopicNo([{ topic_no: ex.topic_no }, { topic_no: topicNo }]);
        if (merged != null) ex.topic_no = merged;
      }
    });
    const chOrdered = this.orderChapterKeysFromByChapter(Object.keys(byChapter), byChapter);
    const topics: Array<{ id: string; name: string; topic_no?: string | null }> = [];
    const seenTopic = new Set<string>();
    for (const chId of chOrdered) {
      const topicsMap = byChapter[chId] || {};
      const rows: Array<{ id: string; name: string; topic_no?: string | null }> = [];
      Object.keys(topicsMap).forEach(topicId => {
        const meta = topicMap.get(topicId);
        if (!meta) return;
        rows.push({ id: topicId, name: meta.name, topic_no: meta.topic_no });
      });
      this.sortTopicsByNo(rows);
      for (const r of rows) {
        if (seenTopic.has(r.id)) continue;
        seenTopic.add(r.id);
        topics.push(r);
      }
    }
    return { byChapter, topics };
  }

  /** Set this.chapters from subject cache keys so chapter list = data (same source as filtering). Ordered by chapter_no. */
  private setChaptersFromSubjectCache(): void {
    const cache = this.subjectCacheByChapter;
    const keys = Object.keys(cache);
    if (keys.length === 0) return;
    this.chapters = keys.map(chId => {
      const topicsMap = cache[chId] || {};
      const firstTopicKey = Object.keys(topicsMap)[0];
      const firstQ = firstTopicKey ? (topicsMap[firstTopicKey] || [])[0] : null;
      const name = firstQ?.chapter_name ?? firstQ?.chapter ?? chId;
      const chapterNo = firstQ?.chapter_no != null ? String(firstQ.chapter_no) : chId;
      return { id: chId, name: name != null ? String(name) : chId, chapter_no: chapterNo || null };
    });
    this.sortChaptersByNo(this.chapters);
  }

  /**
   * Set this.topics from subjectCacheByChapter for selected chapters (or all).
   * With multiple chapters: chapter_no ascending, then topic_no ascending within each chapter.
   */
  private applyTopicsFromSubjectCache(): void {
    const rawIds =
      this.selectedChapterIds.size > 0
        ? Array.from(this.selectedChapterIds)
        : Object.keys(this.subjectCacheByChapter);
    const chapterIds = this.orderChapterIdsForTopics(rawIds);
    const seen = new Set<string>();
    const result: Array<{ id: string; name: string; topic_no?: string | null }> = [];
    chapterIds.forEach(chId => {
      const topicsMap = this.subjectCacheByChapter[chId];
      if (!topicsMap) return;
      const rows: Array<{ id: string; name: string; topic_no?: string | null }> = [];
      Object.keys(topicsMap).forEach(topicId => {
        const qList = topicsMap[topicId] || [];
        const firstQ = qList[0];
        const name = firstQ?.topic_name ?? topicId;
        const topicNo = this.pickBestTopicNo(qList.map((q: any) => ({ topic_no: q?.topic_no })));
        rows.push({ id: topicId, name, topic_no: topicNo ?? undefined });
      });
      this.sortTopicsByNo(rows);
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        result.push(row);
      }
    });
    this.topics = result;
  }

  /**
   * Load full subject cache: from localStorage if present, else fetch all questions via question_list (subject only) and save.
   * Sets subjectCacheByChapter, this.topics, totalQuestionsInDbForSubject. Only falls back to per-topic API if subject list API fails.
   */
  private loadSubjectFullCache(onDone?: () => void): void {
    const sub = this.primarySubject;
    if (!sub || !this.chapters?.length) {
      onDone?.();
      return;
    }
    if (this.tryLoadSubjectCacheFromStorage()) {
      this.build999AndLoadFromCache();
      this.cdr.detectChanges();
      onDone?.();
      return;
    }
    this.apiService.getQuestionListBySubject({
      level_tr: sub.level_tr,
      class_level: sub.class_level,
      subject_tr: sub.subject_tr
    }).subscribe({
      next: (res) => {
        const questions = (res.questions || []) as any[];
        if (questions.length === 0) {
          this.loadSubjectFullCacheFallbackPerTopic(onDone);
          return;
        }
        const { byChapter, topics } = this.buildByChapterFromFlatList(questions);
        this.subjectCacheByChapter = byChapter;
        this.topics = topics;
        this.totalQuestionsInDbForSubject = this.countUniqueQidsInByChapter(byChapter);
        const stored = this.saveSubjectListToStorage(questions);
        this.applyTopicsFromSubjectCache();
        this.build999AndLoadFromCache();
        this.cdr.detectChanges();
        onDone?.();
      },
      error: () => this.loadSubjectFullCacheFallbackPerTopic(onDone)
    });
  }

  /** Fallback: fetch per chapter/topic when question_list (subject only) is not available or fails. */
  private loadSubjectFullCacheFallbackPerTopic(onDone?: () => void): void {
    const sub = this.primarySubject;
    if (!sub || !this.chapters?.length) {
      onDone?.();
      return;
    }
    const byChapter: { [chapterId: string]: { [topicId: string]: any[] } } = {};
    const topicListByChapter: { [chapterId: string]: Array<{ id: string; name: string }> } = {};
    let pendingTopics = this.chapters.length;
    this.chapters.forEach(ch => {
      const chapterId = ch.id;
      const chapterName = ch.name ?? chapterId;
      this.apiService.getQuestionTopics({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr,
        chapter: chapterName
      }).subscribe({
        next: (res) => {
          const topicList = (res.topics || []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name || t.id }));
          topicListByChapter[chapterId] = topicList;
          byChapter[chapterId] = {};
          topicList.forEach((t: { id: string; name: string }) => { byChapter[chapterId][t.id] = []; });
          pendingTopics--;
          if (pendingTopics === 0) {
            const topicCount = Object.values(topicListByChapter).reduce((s, arr) => s + arr.length, 0);
            if (topicCount === 0) {
              this.subjectCacheByChapter = byChapter;
              this.topics = [];
              this.totalQuestionsInDbForSubject = 0;
              this.saveSubjectCacheToStorage(byChapter, 0);
              this.build999AndLoadFromCache();
              this.cdr.detectChanges();
              onDone?.();
              return;
            }
            let pendingQuestions = 0;
            const onQuestionBatch = () => {
              pendingQuestions--;
              if (pendingQuestions === 0) {
                const total = this.countUniqueQidsInByChapter(byChapter);
                this.subjectCacheByChapter = byChapter;
                this.totalQuestionsInDbForSubject = total;
                this.saveSubjectCacheToStorage(byChapter, total);
                this.applyTopicsFromSubjectCache();
                this.build999AndLoadFromCache();
                this.cdr.detectChanges();
                onDone?.();
              }
            };
            this.chapters.forEach(c => {
              const chId = c.id;
              const chName = c.name ?? chId;
              (topicListByChapter[chId] || []).forEach((t: { id: string; name: string }) => {
                pendingQuestions++;
                this.apiService.getQuestionListByTopic({
                  level_tr: sub.level_tr,
                  class_level: sub.class_level,
                  subject_tr: sub.subject_tr,
                  chapter: chName,
                  topic: t.name || t.id
                }).subscribe({
                  next: (res) => {
                    const list = (res.questions || []) as any[];
                    if (byChapter[chId] && byChapter[chId][t.id]) byChapter[chId][t.id] = list;
                    onQuestionBatch();
                  },
                  error: () => onQuestionBatch()
                });
              });
            });
            if (pendingQuestions === 0) onQuestionBatch();
          }
        },
        error: () => {
          pendingTopics--;
          if (pendingTopics === 0) {
            this.subjectCacheByChapter = byChapter;
            this.applyTopicsFromSubjectCache();
            this.totalQuestionsInDbForSubject = this.countUniqueQidsInByChapter(byChapter);
            this.build999AndLoadFromCache();
            this.cdr.detectChanges();
            onDone?.();
          }
        }
      });
    });
  }

  private countUniqueQidsInByChapter(byChapter: { [chapterId: string]: { [topicId: string]: any[] } }): number {
    const set = new Set<number | string>();
    Object.values(byChapter).forEach(topics => {
      Object.values(topics).forEach((arr: any[]) => {
        (arr || []).forEach((q: any) => { if (q?.qid != null) set.add(q.qid); });
      });
    });
    return set.size;
  }

  private saveSubjectCacheToStorage(byChapter: { [chapterId: string]: { [topicId: string]: any[] } }, total: number): void {
    const keyBase = this.buildSubjectCacheKey();
    if (!keyBase) return;
    try {
      const chapterIds = Object.keys(byChapter);
      localStorage.setItem(`${keyBase}_meta`, JSON.stringify({ total, updatedAt: Date.now(), chapterIds }));
      chapterIds.forEach(chId => {
        localStorage.setItem(`${keyBase}_ch_${chId}`, JSON.stringify({ topics: byChapter[chId] }));
      });
    } catch (_) {}
  }

  /** Save flat question list to localStorage (chunked). Returns false if storage fails (e.g. quota). */
  private saveSubjectListToStorage(questions: any[]): boolean {
    const keyBase = this.buildSubjectCacheKey();
    if (!keyBase || !Array.isArray(questions)) return false;
    try {
      const chunkCount = Math.ceil(questions.length / this.SUBJECT_LIST_CHUNK_SIZE) || 1;
      localStorage.setItem(`${keyBase}_list_meta`, JSON.stringify({ total: questions.length, updatedAt: Date.now(), chunkCount }));
      for (let i = 0; i < chunkCount; i++) {
        const chunk = questions.slice(i * this.SUBJECT_LIST_CHUNK_SIZE, (i + 1) * this.SUBJECT_LIST_CHUNK_SIZE);
        localStorage.setItem(`${keyBase}_list_chunk_${i}`, JSON.stringify(chunk));
      }
      return true;
    } catch {
      return false;
    }
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private loadingService: LoadingService,
    private disappearedQuestions: DisappearedQuestionsService,
    private elRef: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef
  ) { }

  ngAfterViewInit(): void {
    const run = () => this.updateFilterLineStartMargins();
    setTimeout(run, 0);
    this.filterItems.changes.subscribe(() => setTimeout(run, 0));
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateFilterLineStartMargins();
    this.measureOptionsLayouts();
  }

  /** Mark the first element of each wrapped line so only they get margin-left: 21px */
  private updateFilterLineStartMargins(): void {
    if (!this.filterItems?.length) return;
    const items = this.filterItems.map(f => f.nativeElement);
    const LINE_THRESHOLD = 2; // px tolerance for same line
    let prevTop = -1;
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const isFirstOnLine = i > 0 && (prevTop < 0 || rect.top > prevTop + LINE_THRESHOLD);
      if (isFirstOnLine) {
        el.classList.add('filter-item-line-start');
      } else {
        el.classList.remove('filter-item-line-start');
      }
      prevTop = rect.top;
    });
  }

  /** Timer for auto-close when cursor leaves dropdown (1000ms). */
  private dropdownLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  private dropdownLeaveKind: string | null = null;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.elRef.nativeElement.contains(target) && target.closest('.filter-dropdown')) return;
    this.closeAllDropdowns();
  }

  onFilterDropdownEnter(): void {
    this.dropdownLeaveKind = null;
    if (this.dropdownLeaveTimer) {
      clearTimeout(this.dropdownLeaveTimer);
      this.dropdownLeaveTimer = null;
    }
  }

  onFilterDropdownLeave(kind: string): void {
    this.dropdownLeaveKind = kind;
    this.dropdownLeaveTimer = setTimeout(() => {
      if (this.dropdownLeaveKind === kind) this.closeDropdownByKind(kind);
      this.dropdownLeaveTimer = null;
    }, 1000);
  }

  private closeDropdownByKind(kind: string): void {
    switch (kind) {
      case 'level': this.levelDropdownOpen = false; break;
      case 'class': this.classDropdownOpen = false; break;
      case 'group': this.groupDropdownOpen = false; break;
      case 'subject': this.subjectDropdownOpen = false; break;
      case 'chapter': this.chapterDropdownOpen = false; break;
      case 'topic': this.topicDropdownOpen = false; break;
      case 'type': this.typeDropdownOpen = false; break;
      case 'moreFilters': this.moreFiltersOpen = false; break;
    }
  }

  private closeAllDropdowns(): void {
    if (this.dropdownLeaveTimer) {
      clearTimeout(this.dropdownLeaveTimer);
      this.dropdownLeaveTimer = null;
    }
    this.dropdownLeaveKind = null;
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.typeDropdownOpen = false;
    this.levelDropdownOpen = false;
    this.classDropdownOpen = false;
    this.groupDropdownOpen = false;
    this.subjectDropdownOpen = false;
    this.moreFiltersOpen = false;
  }

  ngOnInit(): void {
    this.loadingService.setTotal(2);
    this.disappearedQuestions.load();
    this.loadQuestionLevels();
    this.loadCheradipSources();
    this.route.params.subscribe(params => {
      this.currentSubject = params['subject'] || '';
      this.currentChapter = params['chapterName'] || '';
      const qid = params['id'];
      const urlSegments = this.route.snapshot.url;
      const lastPath = urlSegments.length ? urlSegments[urlSegments.length - 1].path : '';
      this.isEditRoute = !!qid;
      this.isFormMode = lastPath === 'new' || !!qid;
      this.editQuestion = null;
      this.updateBreadcrumb();
      if (this.isFormMode && qid) {
        this.loadQuestionForEdit(qid);
      } else {
        this.loadData();
        if (this.isFormMode && !qid && this.primarySubject && this.currentChapter) {
          this.loadFormTopics(this.currentChapter);
        }
      }
    });
  }

  ngOnDestroy(): void {
    if (this.dropdownLeaveTimer) clearTimeout(this.dropdownLeaveTimer);
  }

  /** Load levels from cheradip_hsc (first dropdown). Order by class_level descending (highest first). */
  loadQuestionLevels(): void {
    this.apiService.getQuestionLevels().subscribe({
      next: (res) => {
        const list: QuestionLevel[] = (res.levels || []) as QuestionLevel[];
        this.levels = list.slice().sort((a, b) => {
          const orderA = a.sort_order ?? 0;
          const orderB = b.sort_order ?? 0;
          if (orderB !== orderA) return orderB - orderA; // descending
          return ((a.level_tr || '').localeCompare(b.level_tr || ''));
        });
        const qp = this.route.snapshot.queryParamMap;
        const qLevel = (qp.get('level_tr') || '').trim();
        if (!this.isFormMode && qLevel && this.levels.some((l) => l.level_tr === qLevel)) {
          const qSubject = (qp.get('subject_tr') || '').trim();
          const classLevel = (qp.get('class_level') || '').trim() || undefined;
          const wantGroup = (qp.get('group') || '').trim() || undefined;
          const stored = this.loadFilterState();
          const urlHasSubject = !!qSubject;
          const stateMatchesUrl =
            !!stored &&
            stored.level === qLevel &&
            (!classLevel || !stored.class || stored.class === classLevel) &&
            (!wantGroup || !stored.group || stored.group === wantGroup) &&
            (!urlHasSubject || stored.subject === qSubject);
          const hasDownstream =
            !!stored &&
            ((stored.chapterIds?.length ?? 0) > 0 ||
              (stored.topicIds?.length ?? 0) > 0 ||
              (stored.sources?.length ?? 0) > 0 ||
              (stored.years?.length ?? 0) > 0 ||
              (stored.types?.length ?? 0) > 0 ||
              (Array.isArray(stored.questionIds) && stored.questionIds.length > 0) ||
              stored.instituteType != null);
          this._pendingFilterState =
            stateMatchesUrl && stored && urlHasSubject ? stored : null;
          this._restoreChapterTopicAfterSubjectLoad = !!(this._pendingFilterState && hasDownstream);
          this.applyFiltersFromUrl(
            qLevel,
            classLevel,
            wantGroup || undefined,
            qSubject || undefined
          );
          this.loadingService.completeOne();
          return;
        }
        this._pendingFilterState = this.loadFilterState();
        if (!this.isFormMode && this._pendingFilterState?.level && this.levels.some(l => l.level_tr === this._pendingFilterState!.level)) {
          this.selectedLevel = this._pendingFilterState.level;
          this.apiService.getQuestionClasses(this.selectedLevel).subscribe({
            next: (classesRes) => {
              this.classes = classesRes.classes || [];
              if (this.classes.length === 1) this.selectedClass = this.classes[0].value;
              else if (this._pendingFilterState?.class && this.classes.some(c => c.value === this._pendingFilterState!.class))
                this.selectedClass = this._pendingFilterState.class;
              this.loadGroupsAndSubjects(() => this.continueRestoreAfterSubjects(), () => {
                const s = this._pendingFilterState;
                if (s?.group && this.groups.includes(s.group)) this.selectedGroup = s.group;
              });
            },
            error: () => { this._pendingFilterState = null; }
          });
          this.loadingService.completeOne();
          return;
        }
        this._pendingFilterState = null;
        this.loadingService.completeOne();
      },
      error: () => { this.levels = []; this._pendingFilterState = null; this.loadingService.completeOne(); }
    });
  }

  /**
   * Apply filters from /question?level_tr=&class_level=&group=&subject_tr= (same params as question_subjects API).
   * Runs after levels are loaded; clears localStorage-driven restore for this visit.
   */
  private applyFiltersFromUrl(
    levelTr: string,
    classLevel: string | undefined,
    qGroup: string | undefined,
    qSubject: string | undefined
  ): void {
    this.selectedLevel = levelTr;
    this.selectedClass = '';
    this.selectedGroup = '';
    this.selectedSubjectTr = '';
    this.subjects = [];
    this.classes = [];
    this.groups = [];
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this.apiService.getQuestionClasses(levelTr).subscribe({
      next: (classesRes) => {
        this.classes = classesRes.classes || [];
        if (classLevel && this.classes.some((c) => c.value === classLevel)) {
          this.selectedClass = classLevel;
        } else if (this.classes.length === 1) {
          this.selectedClass = this.classes[0].value;
        }
        const wantGroup = qGroup?.trim();
        this.loadGroupsAndSubjects(
          () => {
            if (qSubject && this.subjects.some((s) => s.subject_tr === qSubject)) {
              this.selectedSubjectTr = qSubject;
              this.currentSubject = qSubject;
              this.onSubjectSelectionChange();
              if (!this._restoreChapterTopicAfterSubjectLoad) {
                this.saveFilterState();
              }
            } else {
              this.saveFilterState();
            }
            this.syncQuestionRouteQueryParams();
          },
          () => {
            if (wantGroup && this.groups.includes(wantGroup)) this.selectedGroup = wantGroup;
          }
        );
      },
      error: () => {
        this.classes = [];
      },
    });
  }

  /** Keep /question URL in sync with filters (bookmarkable; matches API query shape). */
  private syncQuestionRouteQueryParams(): void {
    if (!this.selectedLevel) {
      this.router.navigate(['/question']);
      return;
    }
    const q: Record<string, string> = { level_tr: this.selectedLevel };
    if (this.selectedClass) q['class_level'] = this.selectedClass;
    if (this.selectedGroup) q['group'] = this.selectedGroup;
    if (this.selectedSubjectTr) q['subject_tr'] = this.selectedSubjectTr;
    this.router.navigate(['/question'], { queryParams: q });
  }

  /**
   * Restore path: subject first – load chapters and questions together for the subject, then apply saved chapter/topic as filters.
   */
  private continueRestoreAfterSubjects(): void {
    const s = this._pendingFilterState;
    if (s?.group && this.groups.includes(s.group)) this.selectedGroup = s.group;
    if (s?.subject && this.subjects.some(sub => sub.subject_tr === s.subject)) {
      this.selectedSubjectTr = s.subject!;
      this.currentSubject = s.subject!;
    }
    const sub = this.primarySubject;
    if (!sub) { this._pendingFilterState = null; return; }
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this._topicQuestionsLegacy = [];
    this.subsourceSources = [];
    this.subsourceYears = [];
    this.selectedSources = new Set();
    this.selectedYears = new Set();
    const chapters$ = this.apiService.getQuestionChapters({ level_tr: sub.level_tr, class_level: sub.class_level, subject_tr: sub.subject_tr });
    const questions$ = this.apiService.getQuestionListBySubject({ level_tr: sub.level_tr, class_level: sub.class_level, subject_tr: sub.subject_tr });
    forkJoin({ chapters: chapters$, questions: questions$ }).subscribe({
      next: (res) => {
        const ch = res.chapters;
        const questions = (res.questions?.questions ?? []) as any[];
        if (questions.length === 0) {
          this.chapters = Array.isArray(ch) ? ch : (ch?.chapters ?? []);
          this.sortChaptersByNo(this.chapters);
          this.loadSubjectFullCacheFallbackPerTopic(() => this.applyRestoreFiltersAndBuild999());
          return;
        }
        const { byChapter, topics } = this.buildByChapterFromFlatList(questions);
        this.subjectCacheByChapter = byChapter;
        this.setChaptersFromSubjectCache();
        this.topics = topics;
        this.totalQuestionsInDbForSubject = this.countUniqueQidsInByChapter(byChapter);
        this.saveSubjectListToStorage(questions);
        this.applyRestoreFiltersAndBuild999();
      },
      error: () => {
        this.chapters = [];
        this.apiService.getQuestionChapters({ level_tr: sub.level_tr, class_level: sub.class_level, subject_tr: sub.subject_tr }).subscribe({
          next: (r) => {
            const ch = (r as any).chapters ?? r;
            this.chapters = Array.isArray(ch) ? ch : [];
            this.sortChaptersByNo(this.chapters);
            this.loadSubjectFullCache(() => this.applyRestoreFiltersAndBuild999());
          },
          error: () => { this._pendingFilterState = null; }
        });
      }
    });
  }

  /**
   * Restore chapter and topic from saved state. Always reads chapter/topic from localStorage (single source of truth) so no duplicate/cleared in-memory state can block restore.
   */
  private applyRestoreFiltersAndBuild999(): void {
    const s = this._pendingFilterState;
    const cache = this.subjectCacheByChapter;
    if (Object.keys(cache).length > 0) {
      this.setChaptersFromSubjectCache();
    }
    // Always read chapter/topic from localStorage so we don't rely on _pendingFilterState (may be null or cleared)
    const stored = this.loadFilterState();
    const rawCh = stored?.chapterIds ?? (stored as any)?.chapter_ids;
    const rawTop = stored?.topicIds ?? (stored as any)?.topic_ids;
    const savedChIds: string[] = Array.isArray(rawCh) ? rawCh.map(x => (x != null ? String(x).trim() : '')).filter(Boolean) : [];
    const savedTopIds: string[] = Array.isArray(rawTop) ? rawTop.map(x => (x != null ? String(x).trim() : '')).filter(Boolean) : [];

    const norm = (x: unknown) => (x != null ? String(x).trim() : '');
    const looseMatch = (savedId: string, itemId: unknown) =>
      savedId === norm(itemId) || savedId == itemId;

    if (savedChIds.length > 0 && this.chapters?.length) {
      const matched = this.chapters.filter(c => savedChIds.some(sid => looseMatch(sid, c.id)));
      if (matched.length > 0) {
        this.selectedChapterIds = new Set(matched.map(c => (c.id != null ? String(c.id) : '')).filter(Boolean));
      } else {
        this.applyChapterTopicSelectionManually(this.chapters, savedChIds, true);
      }
    }
    const firstChId = Array.from(this.selectedChapterIds)[0];
    this.currentChapter = this.chapters?.find(c => c.id == firstChId)?.name
      ?? (cache[firstChId] && Object.values(cache[firstChId])[0]?.[0]?.chapter_name)
      ?? (firstChId != null ? String(firstChId) : '');

    this.applyTopicsFromSubjectCache();

    if (savedTopIds.length > 0 && this.topics?.length) {
      const matched = this.topics.filter(t => savedTopIds.some(sid => looseMatch(sid, t.id)));
      if (matched.length > 0) {
        this.selectedTopicIds = new Set(matched.map(t => (t.id != null ? String(t.id) : '')).filter(Boolean));
      } else {
        this.applyChapterTopicSelectionManually(this.topics, savedTopIds, false);
      }
    }

    const hasSubjectCache = Object.keys(cache).length > 0;
    if (this.primarySubject && hasSubjectCache) {
      this.build999AndLoadFromCache();
    } else {
      this._pendingFilterState = null;
    }
    if (this.topicQuestionsFullCache.length > 0) this.topicQuestionsLoaded = true;
    if (this.selectedLevel) this.syncQuestionRouteQueryParams();
    this.saveFilterState();
    this.cdr.detectChanges();
  }

  /** Manually add to chapter or topic selection: for each saved id, if any list item matches (== or normalized string), add that item's id to the Set. */
  private applyChapterTopicSelectionManually(
    list: Array<{ id?: unknown }>,
    savedIds: unknown[],
    isChapter: boolean
  ): void {
    const added: unknown[] = [];
    list.forEach(item => {
      if (item.id == null) return;
      if (savedIds.some(sid => sid == item.id || (sid != null && String(sid) === String(item.id)))) {
        added.push(item.id);
      }
    });
    if (added.length > 0) {
      const asStrings = added.map(x => (x != null ? String(x) : '')).filter(Boolean);
      if (isChapter) {
        this.selectedChapterIds = new Set([...this.selectedChapterIds, ...asStrings]);
      } else {
        this.selectedTopicIds = new Set([...this.selectedTopicIds, ...asStrings]);
      }
    }
  }

  /** Whether chapter is selected (loose equality so 1 and "1" both match – same idea as subject === comparison). */
  isChapterSelected(ch: { id?: unknown }): boolean {
    return Array.from(this.selectedChapterIds).some(id => id == ch.id);
  }

  /** Whether topic is selected (loose equality so id types never break checkbox). */
  isTopicSelected(t: { id?: unknown }): boolean {
    return Array.from(this.selectedTopicIds).some(id => id == t.id);
  }

  get selectedLevelLabel(): string {
    if (!this.selectedLevel) return 'Select Level';
    const lvl = this.levels.find(l => l.level_tr === this.selectedLevel);
    return lvl ? lvl.label : this.selectedLevel;
  }

  toggleLevelDropdown(event?: MouseEvent): void {
    this.levelDropdownOpen = !this.levelDropdownOpen;
    if (this.levelDropdownOpen) {
      this.classDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      this.typeDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  onLevelSelect(levelTr: string): void {
    this.levelDropdownOpen = false;
    this.onLevelChange(levelTr || '');
  }

  onLevelChange(levelTr: string): void {
    this.selectedLevel = levelTr || '';
    this.selectedClass = '';
    this.selectedGroup = '';
    this.classes = [];
    this.groups = [];
    this.selectedSubjectTr = '';
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.currentSubject = '';
    this.currentChapter = '';
    if (!this.selectedLevel) {
      this.router.navigate(['/question']);
      return;
    }
    this.apiService.getQuestionClasses(this.selectedLevel).subscribe({
      next: (res) => {
        this.classes = res.classes || [];
        if (this.classes.length === 1) {
          this.selectedClass = this.classes[0].value;
          this.loadGroupsAndSubjects(() => this.syncQuestionRouteQueryParams());
        } else {
          if (this.classes.length === 0) this.loadGroupsAndSubjects(() => this.syncQuestionRouteQueryParams());
          else {
            this.loadGroups();
            this.syncQuestionRouteQueryParams();
          }
        }
      },
      error: () => {
        this.classes = [];
        this.loadGroupsAndSubjects(() => this.syncQuestionRouteQueryParams());
      }
    });
    this.syncQuestionRouteQueryParams();
    this.saveFilterState();
  }

  get selectedClassLabel(): string {
    if (!this.selectedClass) return 'Select Class';
    const c = this.classes.find(x => x.value === this.selectedClass);
    return c ? c.label : this.selectedClass;
  }

  toggleClassDropdown(event?: MouseEvent): void {
    this.classDropdownOpen = !this.classDropdownOpen;
    if (this.classDropdownOpen) {
      this.levelDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      this.typeDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  onClassSelect(classVal: string): void {
    this.classDropdownOpen = false;
    this.onClassChange(classVal || '');
  }

  onClassChange(classVal: string): void {
    this.selectedClass = classVal || '';
    this.selectedGroup = '';
    this.selectedSubjectTr = '';
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.currentSubject = '';
    this.currentChapter = '';
    this.loadGroupsAndSubjects(() => this.syncQuestionRouteQueryParams());
    this.syncQuestionRouteQueryParams();
    this.saveFilterState();
  }

  get selectedGroupLabel(): string {
    if (!this.selectedGroup) return 'Select Group';
    return this.selectedGroup;
  }

  toggleGroupDropdown(event?: MouseEvent): void {
    this.groupDropdownOpen = !this.groupDropdownOpen;
    if (this.groupDropdownOpen) {
      this.levelDropdownOpen = false;
      this.classDropdownOpen = false;
      this.subjectDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      this.typeDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  onGroupSelect(group: string): void {
    this.groupDropdownOpen = false;
    this.onGroupChange(group || '');
  }

  onGroupChange(group: string): void {
    this.selectedGroup = group || '';
    this.selectedSubjectTr = '';
    this.subjects = [];
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.currentSubject = '';
    this.currentChapter = '';
    this.loadSubjects(() => this.syncQuestionRouteQueryParams());
    this.syncQuestionRouteQueryParams();
    this.saveFilterState();
  }

  private loadGroups(): void {
    this.groups = [];
    this.apiService.getQuestionGroups(this.selectedLevel, this.selectedClass || undefined).subscribe({
      next: (res) => { this.groups = res.groups || []; },
      error: () => { this.groups = []; }
    });
  }

  private loadGroupsAndSubjects(afterDone?: () => void, beforeLoadSubjects?: () => void): void {
    this.apiService.getQuestionGroups(this.selectedLevel, this.selectedClass || undefined).subscribe({
      next: (res) => {
        this.groups = res.groups || [];
        beforeLoadSubjects?.();
        this.loadSubjects(afterDone);
      },
      error: () => {
        this.groups = [];
        beforeLoadSubjects?.();
        this.loadSubjects(afterDone);
      }
    });
  }

  private loadSubjects(afterDone?: () => void): void {
    const params: { level_tr: string; class_level?: string; group?: string } = { level_tr: this.selectedLevel };
    if (this.selectedClass) params.class_level = this.selectedClass;
    if (this.selectedGroup) params.group = this.selectedGroup;
    this.subjectListLoading = true;
    this.apiService.getQuestionSubjects(params).subscribe({
      next: (res) => {
        this.subjects = res.subjects || [];
        afterDone?.();
      },
      error: () => {
        this.subjects = [];
        afterDone?.();
      },
      complete: () => {
        this.subjectListLoading = false;
      }
    });
  }

  get selectedSubjectLabel(): string {
    if (!this.selectedSubjectTr) return 'Select Subject';
    const sub = this.subjects.find(s => s.subject_tr === this.selectedSubjectTr);
    return sub ? (sub.name || sub.subject_tr) : this.selectedSubjectTr;
  }

  toggleSubjectDropdown(event?: MouseEvent): void {
    this.subjectDropdownOpen = !this.subjectDropdownOpen;
    if (this.subjectDropdownOpen) {
      this.levelDropdownOpen = false;
      this.classDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      this.typeDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  onSubjectSelect(subjectTr: string): void {
    this.subjectDropdownOpen = false;
    this.onSubjectChange(subjectTr || '');
  }

  onSubjectChange(subjectTr: string): void {
    this.selectedSubjectTr = subjectTr || '';
    this.onSubjectSelectionChange();
    this.saveFilterState();
    this.syncQuestionRouteQueryParams();
  }

  /** When subject is (re)selected or cleared: clear all downstream selections (chapters, topics, more filters, question selection) and 999 list. If a subject is selected, load its data and show all questions (no chapter/topic filter). */
  private onSubjectSelectionChange(): void {
    this.chapters = [];
    this.topics = [];
    this.selectedChapterIds = new Set();
    this.selectedTopicIds = new Set();
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.moreFiltersOpen = false;
    this.instituteTypeDropdownOpen = false;
    this._topicQuestionsLegacy = [];
    this.topicQuestionsLoaded = false;
    this.subsourceSources = [];
    this.subsourceYears = [];
    this.selectedSources = new Set();
    this.selectedYears = new Set();
    this.selectedQuestionTypes = new Set();
    this.selectedInstituteType = null;
    this.selectedQuestionIds = new Set();
    this.totalQuestionsInDbForSubject = null;
    this.subjectCacheByChapter = {};
    this.topicQuestionsFullCache = [];
    this.topicQuestionsLoadedCount = 0;
    this.topicQuestionsCacheTotal = 0;
    this.topicQuestionsPage = 1;
    this._hasShown999LimitAlert = false;
    const sub = this.primarySubject;
    this.currentSubject = sub ? sub.subject_tr : '';
    this.currentChapter = '';
    if (sub) {
      this.loadingService.setTotal(1);
      const chapters$ = this.apiService.getQuestionChapters({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr
      });
      const questions$ = this.apiService.getQuestionListBySubject({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr
      });
      forkJoin({ chapters: chapters$, questions: questions$ }).subscribe({
        next: (res) => {
          const questions = (res.questions?.questions ?? []) as any[];
          if (questions.length === 0) {
            this.chapters = res.chapters?.chapters ?? [];
            this.sortChaptersByNo(this.chapters);
            this.loadSubjectFullCacheFallbackPerTopic(() => {
              this.setChaptersFromSubjectCache();
              if (this._restoreChapterTopicAfterSubjectLoad) {
                this._restoreChapterTopicAfterSubjectLoad = false;
                if (!this._pendingFilterState) this._pendingFilterState = this.loadFilterState();
                this.applyRestoreFiltersAndBuild999();
              } else {
                this.cdr.detectChanges();
              }
              this.loadingService.completeOne();
            });
            return;
          }
          const { byChapter, topics } = this.buildByChapterFromFlatList(questions);
          this.subjectCacheByChapter = byChapter;
          this.setChaptersFromSubjectCache();
          this.topics = topics;
          this.totalQuestionsInDbForSubject = this.countUniqueQidsInByChapter(byChapter);
          this.saveSubjectListToStorage(questions);
          const useRestore = this._restoreChapterTopicAfterSubjectLoad;
          if (useRestore) {
            this._restoreChapterTopicAfterSubjectLoad = false;
            if (!this._pendingFilterState) this._pendingFilterState = this.loadFilterState();
            this.applyRestoreFiltersAndBuild999();
          } else {
            this.applyTopicsFromSubjectCache();
            this.build999AndLoadFromCache();
          }
          this.cdr.detectChanges();
          this.loadingService.completeOne();
        },
        error: () => {
          this.chapters = [];
          this.apiService.getQuestionChapters({
            level_tr: sub.level_tr,
            class_level: sub.class_level,
            subject_tr: sub.subject_tr
          }).subscribe({
            next: (r) => {
              this.chapters = (r as any).chapters ?? [];
              this.sortChaptersByNo(this.chapters);
              this.loadSubjectFullCache(() => {
                this.setChaptersFromSubjectCache();
                if (this._restoreChapterTopicAfterSubjectLoad) {
                  this._restoreChapterTopicAfterSubjectLoad = false;
                  if (!this._pendingFilterState) this._pendingFilterState = this.loadFilterState();
                  this.applyRestoreFiltersAndBuild999();
                } else {
                  this.cdr.detectChanges();
                }
                this.loadingService.completeOne();
              });
            },
            error: () => {
              this._restoreChapterTopicAfterSubjectLoad = false;
              this.cdr.detectChanges();
              this.loadingService.completeOne();
            }
          });
        }
      });
    }
  }

  toggleChapterDropdown(event?: MouseEvent): void {
    this.chapterDropdownOpen = !this.chapterDropdownOpen;
    if (this.chapterDropdownOpen) {
      this.topicDropdownOpen = false;
      this.typeDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  get allChaptersSelected(): boolean {
    return this.chapters.length > 0 && this.chapters.every(c => this.isChapterSelected(c));
  }

  onChapterSelectAllToggle(): void {
    if (this.allChaptersSelected) {
      this.selectedChapterIds = new Set();
    } else {
      this.selectedChapterIds = new Set(this.chapters.map(c => c.id));
    }
    this.onChapterSelectionChange();
  }

  onChapterSelect(chapterId: string): void {
    const next = new Set(this.selectedChapterIds);
    if (next.has(chapterId)) next.delete(chapterId);
    else next.add(chapterId);
    this.selectedChapterIds = next;
    this.onChapterSelectionChange();
  }

  clearChapterSelection(): void {
    this.selectedChapterIds = new Set();
    this.onChapterSelectionChange();
  }

  /** True when at least one filter or question selection is set; used to show clear (X) icon. */
  get hasAnyFilterSelection(): boolean {
    return !!(this.selectedLevel || this.selectedClass || this.selectedGroup || this.selectedSubjectTr
      || this.selectedChapterIds.size > 0 || this.selectedTopicIds.size > 0
      || this.selectedSources.size > 0 || this.selectedYears.size > 0 || this.selectedQuestionTypes.size > 0 || this.selectedInstituteType != null
      || this.selectedQuestionIds.size > 0);
  }

  /** Clear all filter selections (level, class, group, subject, chapters, topics, more filters) and reset UI. */
  clearAllFilterSelections(): void {
    this.selectedLevel = '';
    this.selectedClass = '';
    this.selectedGroup = '';
    this.selectedSubjectTr = '';
    this.classes = [];
    this.groups = [];
    this.subjects = [];
    this.chapters = [];
    this.selectedChapterIds = new Set();
    this.topics = [];
    this.selectedTopicIds = new Set();
    this._topicQuestionsLegacy = [];
    this.topicQuestionsLoaded = false;
    this.subsourceSources = [];
    this.subsourceYears = [];
    this.selectedSources = new Set();
    this.selectedYears = new Set();
    this.selectedQuestionTypes = new Set();
    this.selectedInstituteType = null;
    this.selectedQuestionIds = new Set();
    this.levelDropdownOpen = false;
    this.classDropdownOpen = false;
    this.groupDropdownOpen = false;
    this.subjectDropdownOpen = false;
    this.chapterDropdownOpen = false;
    this.topicDropdownOpen = false;
    this.typeDropdownOpen = false;
    this.moreFiltersOpen = false;
    this.instituteTypeDropdownOpen = false;
    this.currentChapter = '';
    try { localStorage.removeItem(this.FILTER_STORAGE_KEY); } catch (_) {}
    this.cdr.detectChanges();
  }

  /** Persist current filter selections to localStorage. Uses chapterIds/topicIds (same pattern as subject and more filters). */
  private saveFilterState(): void {
    try {
      const state = {
        level: this.selectedLevel || undefined,
        class: this.selectedClass || undefined,
        group: this.selectedGroup || undefined,
        subject: this.selectedSubjectTr || undefined,
        chapterIds: Array.from(this.selectedChapterIds).map(x => (x != null ? String(x) : '')).filter(Boolean),
        topicIds: Array.from(this.selectedTopicIds).map(x => (x != null ? String(x) : '')).filter(Boolean),
        sources: this.selectedSources.size ? Array.from(this.selectedSources) : undefined,
        years: this.selectedYears.size ? Array.from(this.selectedYears) : undefined,
        types: this.selectedQuestionTypes.size ? Array.from(this.selectedQuestionTypes) : undefined,
        instituteType: this.selectedInstituteType ?? undefined,
        questionIds: this.selectedQuestionIds.size ? Array.from(this.selectedQuestionIds) : undefined
      };
      localStorage.setItem(this.FILTER_STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  /** Read saved filter state from localStorage. Normalizes chapterIds/topicIds to arrays (same key as save). */
  private loadFilterState(): typeof this._pendingFilterState {
    try {
      const raw = localStorage.getItem(this.FILTER_STORAGE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      return {
        ...o,
        chapterIds: Array.isArray(o.chapterIds) ? o.chapterIds : (Array.isArray((o as any).chapter_ids) ? (o as any).chapter_ids : []),
        topicIds: Array.isArray(o.topicIds) ? o.topicIds : (Array.isArray((o as any).topic_ids) ? (o as any).topic_ids : []),
        types: Array.isArray((o as any).types) ? (o as any).types : []
      };
    } catch (_) {
      return null;
    }
  }

  get selectedChapterName(): string {
    if (this.selectedChapterIds.size === 0) return 'Select Chapter';
    if (this.selectedChapterIds.size === 1) {
      const id = Array.from(this.selectedChapterIds)[0];
      const ch = this.chapters?.find(c => c.id == id);
      return ch ? ch.name : '';
    }
    return this.selectedChapterIds.size + ' chapters';
  }

  private onChapterSelectionChange(): void {
    this.topics = [];
    this.selectedTopicIds = new Set();
    this.topicDropdownOpen = false;
    this._topicQuestionsLegacy = [];
    this.subsourceSources = [];
    this.subsourceYears = [];
    this.selectedSources = new Set();
    this.selectedYears = new Set();
    this.selectedQuestionTypes = new Set();
    const firstCh = this.chapters.find(c => this.isChapterSelected(c));
    this.currentChapter = firstCh ? firstCh.name : '';
    this.loadingService.setTotal(1);
    if (Object.keys(this.subjectCacheByChapter).length > 0) {
      this.applyTopicsFromSubjectCache();
      this.build999AndLoadFromCache();
      this.cdr.detectChanges();
      this.loadingService.completeOne();
    } else {
      this.loadSubjectFullCache(() => {
        if (Object.keys(this.subjectCacheByChapter).length > 0) {
          this.applyTopicsFromSubjectCache();
          this.build999AndLoadFromCache();
        } else {
          this.loadTopics();
        }
        this.cdr.detectChanges();
        this.loadingService.completeOne();
      });
    }
    this.saveFilterState();
  }

  toggleTopicDropdown(event?: MouseEvent): void {
    this.topicDropdownOpen = !this.topicDropdownOpen;
    if (this.topicDropdownOpen) {
      this.chapterDropdownOpen = false;
      this.typeDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  toggleTypeDropdown(event?: MouseEvent): void {
    this.typeDropdownOpen = !this.typeDropdownOpen;
    if (this.typeDropdownOpen) {
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      this.moreFiltersOpen = false;
      setTimeout(() => this.positionDropdownPanel(event));
    }
  }

  /** Position dropdown panel: flip to right if it would overflow; reduce max-height so gap to window bottom is at least 100px. */
  positionDropdownPanel(event?: MouseEvent): void {
    if (!event?.target) return;
    const wrapper = (event.target as HTMLElement).closest('.filter-dropdown');
    if (!wrapper) return;
    const panel = wrapper.querySelector('.filter-dropdown-panel') as HTMLElement;
    const trigger = wrapper.querySelector('.filter-dropdown-btn') as HTMLElement;
    if (!panel || !trigger) return;
    panel.classList.remove('dropdown-panel-right');
    panel.style.maxHeight = '';
    const tr = trigger.getBoundingClientRect();
    const marginTop = 4;
    const minGapToBottom = 100;
    const defaultMaxHeight = 600;
    const minPanelHeight = 150;
    const spaceBelow = window.innerHeight - tr.bottom - marginTop;
    const maxHeightToFit = spaceBelow - minGapToBottom;
    const maxHeight = Math.min(defaultMaxHeight, Math.max(minPanelHeight, maxHeightToFit));
    panel.style.maxHeight = maxHeight + 'px';
    const pw = panel.offsetWidth;
    if (tr.left + pw > window.innerWidth) {
      panel.classList.add('dropdown-panel-right');
    }
  }

  get allTopicsSelected(): boolean {
    return this.topics.length > 0 && this.topics.every(t => this.isTopicSelected(t));
  }

  private normalizeQuestionTypeLabel(v: unknown): string {
    return (v != null ? String(v).trim() : '') || 'Unknown';
  }

  showEditOptions(q: { type?: unknown } | null | undefined): boolean {
    const type = this.normalizeQuestionTypeLabel(q?.type).toLowerCase();
    return type === 'mcq' || type.includes('বহুনির্বাচনি');
  }

  /** Available type options from current question pool (before type filter, after source/year + disappeared filters). */
  get availableQuestionTypes(): string[] {
    const list = this.getTopicQuestionsFilteredSortedCore(false, true);
    const out = new Set<string>();
    list.forEach((q: any) => out.add(this.normalizeQuestionTypeLabel(q?.type)));
    return Array.from(out).sort((a, b) => a.localeCompare(b));
  }

  get allQuestionTypesSelected(): boolean {
    const opts = this.availableQuestionTypes;
    return opts.length > 0 && opts.every((t) => this.selectedQuestionTypes.has(t));
  }

  onQuestionTypeSelectAllToggle(): void {
    if (this.allQuestionTypesSelected) {
      this.selectedQuestionTypes = new Set();
    } else {
      this.selectedQuestionTypes = new Set(this.availableQuestionTypes);
    }
    this.onQuestionTypeSelectionChange();
  }

  onQuestionTypeToggle(typeLabel: string): void {
    const next = new Set(this.selectedQuestionTypes);
    if (next.has(typeLabel)) next.delete(typeLabel);
    else next.add(typeLabel);
    this.selectedQuestionTypes = next;
    this.onQuestionTypeSelectionChange();
  }

  clearQuestionTypeSelection(): void {
    this.selectedQuestionTypes = new Set();
    this.onQuestionTypeSelectionChange();
  }

  get selectedQuestionTypeName(): string {
    if (this.selectedQuestionTypes.size === 0) return 'Select Type';
    if (this.selectedQuestionTypes.size === 1) {
      return Array.from(this.selectedQuestionTypes)[0] || 'Select Type';
    }
    return `${this.selectedQuestionTypes.size} types`;
  }

  private onQuestionTypeSelectionChange(): void {
    this.topicQuestionsPage = 1;
    this.saveFilterState();
  }

  onTopicSelectAllToggle(): void {
    if (this.allTopicsSelected) {
      this.selectedTopicIds = new Set();
    } else {
      this.selectedTopicIds = new Set(this.topics.map(t => t.id));
    }
    this.onTopicSelectionChange();
  }

  onTopicSelect(topicId: string): void {
    const next = new Set(this.selectedTopicIds);
    if (next.has(topicId)) next.delete(topicId);
    else next.add(topicId);
    this.selectedTopicIds = next;
    this.onTopicSelectionChange();
  }

  clearTopicSelection(): void {
    this.selectedTopicIds = new Set();
    this.onTopicSelectionChange();
  }

  get selectedTopicName(): string {
    if (this.selectedTopicIds.size === 0) return 'Select Topic';
    if (this.selectedTopicIds.size === 1) {
      const id = Array.from(this.selectedTopicIds)[0];
      const t = this.topics.find(x => x.id == id);
      return t ? t.name : '';
    }
    return this.selectedTopicIds.size + ' topics';
  }

  private onTopicSelectionChange(): void {
    this._topicQuestionsLegacy = [];
    this.topicQuestionsFullCache = [];
    this.topicQuestionsLoadedCount = 0;
    this.topicQuestionsPage = 1;
    this.subsourceSources = [];
    this.subsourceYears = [];
    this.selectedSources = new Set();
    this.selectedYears = new Set();
    this.selectedQuestionTypes = new Set();
    this.typeDropdownOpen = false;
    this.topicQuestionsLoaded = false;
    const hasSubjectCache = Object.keys(this.subjectCacheByChapter).length > 0;
    if (this.primarySubject && (this.selectedTopicIds.size > 0 || hasSubjectCache)) {
      this.build999AndLoadFromCache();
    } else {
      this._topicQuestionsLegacy = [];
      this.topicQuestionsFullCache = [];
      this.topicQuestionsLoadedCount = 0;
      this.subsourceSources = [];
      this.subsourceYears = [];
      this.selectedSources = new Set();
      this.selectedYears = new Set();
      this.topicQuestionsLoaded = true;
    }
    this.saveFilterState();
  }

  private loadTopics(onDone?: () => void): void {
    const sub = this.primarySubject;
    if (!sub) { onDone?.(); return; }
    const finish = () => { this.cdr.detectChanges(); onDone?.(); };
    if (this.selectedChapterIds.size === 0) {
      this.apiService.getQuestionTopics({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr
      }).subscribe({
        next: (res) => {
          this.topics = res.topics || [];
          this.sortTopicsByNo(this.topics);
          finish();
        },
        error: () => { this.topics = []; finish(); }
      });
      return;
    }
    const orderedChIds = this.orderChapterIdsForTopics(Array.from(this.selectedChapterIds));
    const byChapter: { [chId: string]: Array<{ id: string; name: string; topic_no?: string | null }> } = {};
    let pending = orderedChIds.length;
    const flushTopics = () => {
      const seen = new Set<string>();
      const done: Array<{ id: string; name: string; topic_no?: string | null }> = [];
      for (const chId of orderedChIds) {
        const list = byChapter[chId] || [];
        for (const t of list) {
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          done.push(t);
        }
      }
      this.topics = done;
      finish();
    };
    orderedChIds.forEach(chapterId => {
      const chapterParam = this.chapters.find(c => c.id == chapterId);
      const chapterName = chapterParam?.name ?? chapterId;
      this.apiService.getQuestionTopics({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr,
        chapter: chapterName
      }).subscribe({
        next: (res) => {
          const list = (res.topics || []) as Array<{ id: string; name: string; topic_no?: string | null }>;
          this.sortTopicsByNo(list);
          byChapter[chapterId] = list;
          pending--;
          if (pending === 0) flushTopics();
        },
        error: () => {
          byChapter[chapterId] = [];
          pending--;
          if (pending === 0) flushTopics();
        }
      });
    });
  }

  /** Build 999 list, save to localStorage, then load first chunk; or load from cache if present. */
  private build999AndLoadFromCache(): void {
    const sub = this.primarySubject;
    if (!sub) return;
    const hasTopicSelection = this.selectedTopicIds.size > 0;
    const hasSubjectCache = Object.keys(this.subjectCacheByChapter).length > 0;
    if (!hasTopicSelection && !hasSubjectCache) return;
    this.topicQuestionsLoaded = false;
    const keyBase = this.buildQ999CacheKey();
    if (keyBase) {
      try {
        const metaStr = localStorage.getItem(`${keyBase}_meta`);
        const meta = metaStr ? JSON.parse(metaStr) : null;
        const total = meta?.total ?? 0;
        if (total > 0) {
          const allChunks: any[] = [];
          const chunkCount = Math.ceil(total / this.Q999_CHUNK_SIZE);
          for (let i = 0; i < chunkCount; i++) {
            const str = localStorage.getItem(`${keyBase}_chunk_${i}`);
            const chunk = str ? JSON.parse(str) : null;
            if (Array.isArray(chunk)) allChunks.push(...chunk);
            else break;
          }
          if (allChunks.length > 0) {
            this.topicQuestionsFullCache = allChunks;
            this.topicQuestionsLoadedCount = allChunks.length;
            this.topicQuestionsCacheTotal = total;
            this.updateSubsourceOptionsFromList(this.topicQuestionsFullCache);
            this.applyPendingFilterStateSourcesYearsQuestions();
            this.topicQuestionsPage = 1;
            this.topicQuestionsLoaded = true;
            this.cdr.detectChanges();
            setTimeout(() => this.measureOptionsLayouts(), 80);
            return;
          }
        }
      } catch (_) {}
    }
    this.topicQuestionsFullCache = [];
    this.topicQuestionsLoadedCount = 0;
    if (Object.keys(this.subjectCacheByChapter).length > 0) {
      this.build999FromSubjectCache();
    } else {
      this.load999WithDistribution();
    }
  }

  /**
   * Build the 999 list from in-memory subject cache: filter by selected chapters/topics, then apply
   * distribution (split across chapters → topics; within topic prefer largest subsource then qid; rebalance to 999).
   * No API calls. Saves result to 999 cache and displays.
   */
  private build999FromSubjectCache(): void {
    const list = this.compute999FromSubjectCache();
    if (list.length > 0) {
      this.finish999AndSave(list);
    } else {
      this.load999WithDistribution();
    }
  }

  /**
   * Distribution: chapters (equal split) → topics (equal split) → within topic by subsource then qid.
   * If a chapter has more topics than its quota, pick one question per topic serially by qid until quota used.
   * Rebalance so total is up to 999 when possible. Returns list in retrieval order (no final sort).
   */
  private compute999FromSubjectCache(): any[] {
    const chapterIds = this.selectedChapterIds.size > 0
      ? Array.from(this.selectedChapterIds).filter(id => this.subjectCacheByChapter[id])
      : Object.keys(this.subjectCacheByChapter);
    if (chapterIds.length === 0) return [];

    type TopicEntry = { chapterId: string; topicId: string; questions: any[] };
    const entries: TopicEntry[] = [];
    chapterIds.forEach(chapterId => {
      const topicsMap = this.subjectCacheByChapter[chapterId] || {};
      const topicIds = this.selectedTopicIds.size > 0
        ? Object.keys(topicsMap).filter(tid => Array.from(this.selectedTopicIds).some(id => id == tid))
        : Object.keys(topicsMap);
      topicIds.forEach(topicId => {
        const questions = (topicsMap[topicId] || []).slice();
        if (questions.length === 0) return;
        const sorted = questions.sort((a: any, b: any) => {
          const ta = this.parseSubsourceTokens(a.subsource);
          const tb = this.parseSubsourceTokens(b.subsource);
          const maxYearA = ta.length ? Math.max(...ta.map(t => parseInt(t.year, 10) || 0)) : 0;
          const maxYearB = tb.length ? Math.max(...tb.map(t => parseInt(t.year, 10) || 0)) : 0;
          if (maxYearB !== maxYearA) return maxYearB - maxYearA;
          const na = a.qid != null ? Number(a.qid) : NaN;
          const nb = b.qid != null ? Number(b.qid) : NaN;
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
          return 0;
        });
        entries.push({ chapterId, topicId, questions: sorted });
      });
    });
    if (entries.length === 0) return [];

    const totalAvailable = entries.reduce((s, e) => s + e.questions.length, 0);
    const target = Math.min(this.Q999_MAX, totalAvailable);
    if (target <= 0) return [];

    const nChapters = chapterIds.length;
    const perChapterBase = Math.floor(target / nChapters);
    const remainderCh = target % nChapters;
    const chapterQuotas: { [chapterId: string]: number } = {};
    chapterIds.forEach((chId, i) => {
      chapterQuotas[chId] = perChapterBase + (i < remainderCh ? 1 : 0);
    });

    const topicQuotas: { key: string; quota: number }[] = [];
    chapterIds.forEach(chapterId => {
      const chapterEntries = entries.filter(e => e.chapterId === chapterId);
      const quota = chapterQuotas[chapterId] || 0;
      if (chapterEntries.length === 0) return;
      const perTopicBase = Math.floor(quota / chapterEntries.length);
      const rem = quota % chapterEntries.length;
      chapterEntries.forEach((e, i) => {
        topicQuotas.push({ key: `${e.chapterId}\t${e.topicId}`, quota: perTopicBase + (i < rem ? 1 : 0) });
      });
    });

    const seenQids = new Set<number | string>();
    const entryByKey = new Map<string, TopicEntry>();
    entries.forEach(e => { entryByKey.set(`${e.chapterId}\t${e.topicId}`, e); });

    const result: any[] = [];
    const usedByKey: { [key: string]: number } = {};

    function takeFromTopic(entry: TopicEntry, count: number): any[] {
      const key = `${entry.chapterId}\t${entry.topicId}`;
      const start = usedByKey[key] || 0;
      const out: any[] = [];
      for (let i = 0; i < entry.questions.length && out.length < count; i++) {
        const q = entry.questions[start + i];
        if (!q || seenQids.has(q.qid)) continue;
        seenQids.add(q.qid);
        out.push(q);
      }
      usedByKey[key] = start + out.length;
      return out;
    }

    chapterIds.forEach(chapterId => {
      const chapterEntries = entries.filter(e => e.chapterId === chapterId);
      const chapterQuota = chapterQuotas[chapterId] || 0;
      const topicQuotaList = chapterEntries.map(e => ({
        entry: e,
        quota: topicQuotas.find(tq => tq.key === `${e.chapterId}\t${e.topicId}`)?.quota ?? 0
      }));
      const hasZeroQuota = topicQuotaList.some(t => t.quota === 0);
      if (hasZeroQuota && chapterQuota > 0) {
        const topicOrder = chapterEntries.slice().sort((a, b) => {
          const qa = a.questions[0]?.qid;
          const qb = b.questions[0]?.qid;
          const na = qa != null ? Number(qa) : NaN;
          const nb = qb != null ? Number(qb) : NaN;
          return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : 0;
        });
        let taken = 0;
        let round = 0;
        while (taken < chapterQuota) {
          let added = 0;
          for (const e of topicOrder) {
            if (taken >= chapterQuota) break;
            const key = `${e.chapterId}\t${e.topicId}`;
            const used = usedByKey[key] || 0;
            if (used >= e.questions.length) continue;
            const q = e.questions[used];
            if (q && !seenQids.has(q.qid)) {
              seenQids.add(q.qid);
              result.push(q);
              usedByKey[key] = used + 1;
              taken++;
              added++;
            }
          }
          if (added === 0) break;
          round++;
        }
      } else {
        topicQuotaList.forEach(({ entry, quota }) => {
          result.push(...takeFromTopic(entry, quota));
        });
      }
    });

    if (result.length < target && result.length < totalAvailable) {
      const shortfall = target - result.length;
      const remaining = entries.flatMap(e => e.questions.filter(q => !seenQids.has(q.qid)));
      remaining.sort((a: any, b: any) => {
        const ta = this.parseSubsourceTokens(a.subsource);
        const tb = this.parseSubsourceTokens(b.subsource);
        const maxYearA = ta.length ? Math.max(...ta.map(t => parseInt(t.year, 10) || 0)) : 0;
        const maxYearB = tb.length ? Math.max(...tb.map(t => parseInt(t.year, 10) || 0)) : 0;
        if (maxYearB !== maxYearA) return maxYearB - maxYearA;
        const na = a.qid != null ? Number(a.qid) : NaN;
        const nb = b.qid != null ? Number(b.qid) : NaN;
        return (!Number.isNaN(na) && !Number.isNaN(nb)) ? nb - na : 0;
      });
      for (let i = 0; i < shortfall && i < remaining.length; i++) {
        const q = remaining[i];
        if (q && !seenQids.has(q.qid)) {
          seenQids.add(q.qid);
          result.push(q);
        }
      }
    }
    return result.slice(0, this.Q999_MAX);
  }

  private load999WithDistribution(): void {
    const sub = this.primarySubject;
    if (!sub || !this.selectedTopicIds.size) return;
    const chapterParam = this.selectedChapterIds.size === 1
      ? (this.chapters.find(c => this.selectedChapterIds.has(c.id))?.name)
      : undefined;
    const topicIds = Array.from(this.selectedTopicIds);
    const perTopic = Math.max(1, Math.floor(this.Q999_MAX / topicIds.length));
    const all: any[] = [];
    const seenIds = new Set<number | string>();
    let pending = topicIds.length;
    topicIds.forEach(topicId => {
      const topicName = this.topics.find(t => t.id === topicId)?.name ?? topicId;
      this.apiService.getQuestionListByTopic({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr,
        chapter: chapterParam || undefined,
        topic: topicName
      }).subscribe({
        next: (res) => {
          const raw = (res.questions || []) as any[];
          const bySubsource = [...raw].sort((a: any, b: any) => {
            const ta = this.parseSubsourceTokens(a.subsource);
            const tb = this.parseSubsourceTokens(b.subsource);
            const maxYearA = ta.length ? Math.max(...ta.map(t => parseInt(t.year, 10) || 0)) : 0;
            const maxYearB = tb.length ? Math.max(...tb.map(t => parseInt(t.year, 10) || 0)) : 0;
            if (maxYearB !== maxYearA) return maxYearB - maxYearA;
            const na = a.qid != null ? Number(a.qid) : NaN;
            const nb = b.qid != null ? Number(b.qid) : NaN;
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
            return 0;
          });
          for (const q of bySubsource) {
            if (all.length >= this.Q999_MAX) break;
            const qid = q.qid;
            if (qid != null && !seenIds.has(qid)) {
              seenIds.add(qid);
              all.push(q);
              if (all.length >= this.Q999_MAX) break;
            }
          }
          pending--;
          if (pending === 0) this.finish999AndSave(all);
        },
        error: () => {
          pending--;
          if (pending === 0) this.finish999AndSave(all);
        }
      });
    });
  }

  private finish999AndSave(all: any[]): void {
    const slice = all.slice(0, this.Q999_MAX);
    this.topicQuestionsFullCache = slice.slice();
    this.topicQuestionsLoadedCount = slice.length;
    this.topicQuestionsCacheTotal = slice.length;
    this._hasShown999LimitAlert = false;
    const keyBase = this.buildQ999CacheKey();
    if (keyBase) {
      try {
        for (let i = 0; i < slice.length; i += this.Q999_CHUNK_SIZE) {
          const chunk = slice.slice(i, i + this.Q999_CHUNK_SIZE);
          localStorage.setItem(`${keyBase}_chunk_${i / this.Q999_CHUNK_SIZE}`, JSON.stringify(chunk));
        }
        localStorage.setItem(`${keyBase}_meta`, JSON.stringify({ total: slice.length }));
      } catch (_) {}
    }
    this.updateSubsourceOptionsFromList(slice);
    this.applyPendingFilterStateSourcesYearsQuestions();
    this.topicQuestionsLoaded = true;
    this.cdr.detectChanges();
    setTimeout(() => this.measureOptionsLayouts(), 80);
  }

  /** Apply saved sources, years, instituteType and questionIds from _pendingFilterState; then clear it. Call after list/subsource options are ready. */
  private applyPendingFilterStateSourcesYearsQuestions(): void {
    const s = this._pendingFilterState;
    if (!s) return;
    if (s.sources?.length) this.selectedSources = new Set(s.sources.filter(x => this.subsourceSources.includes(x)));
    if (s.years?.length) this.selectedYears = new Set(s.years.filter(x => this.subsourceYears.includes(x)));
    if (s.types?.length) {
      const typeSet = new Set(this.availableQuestionTypes);
      this.selectedQuestionTypes = new Set(s.types.filter((x) => typeSet.has(x)));
    }
    if (s.instituteType != null && this.instituteTypes.includes(s.instituteType)) this.selectedInstituteType = s.instituteType;
    if (Array.isArray(s.questionIds) && s.questionIds.length > 0)
      this.selectedQuestionIds = new Set(s.questionIds);
    this._pendingFilterState = null;
  }

  private updateSubsourceOptionsFromList(list: any[]): void {
    const sourceSet = new Set<string>();
    const yearSet = new Set<string>();
    (list || []).forEach((q: any) => {
      this.parseSubsourceTokens(q.subsource).forEach(t => {
        sourceSet.add(t.source);
        yearSet.add(t.year);
      });
    });
    this.subsourceSources = Array.from(sourceSet).sort();
    this.subsourceYears = Array.from(yearSet).sort((a, b) => a.localeCompare(b));
    this.selectedSources = new Set([...this.selectedSources].filter(x => sourceSet.has(x)));
    this.selectedYears = new Set([...this.selectedYears].filter(x => yearSet.has(x)));
  }

  /** Load more chunks from localStorage when current page requires indices beyond loadedCount. */
  private ensureChunksLoadedForCurrentPage(): void {
    if (this.topicQuestionsCacheTotal <= 0 || this.topicQuestionsFullCache.length === 0) return;
    const keyBase = this.buildQ999CacheKey();
    if (!keyBase) return;
    const requiredEnd = this.topicQuestionsPage * this.Q999_PAGE_SIZE;
    while (this.topicQuestionsLoadedCount < requiredEnd && this.topicQuestionsLoadedCount < this.topicQuestionsCacheTotal) {
      const chunkIndex = Math.floor(this.topicQuestionsLoadedCount / this.Q999_CHUNK_SIZE);
      try {
        const str = localStorage.getItem(`${keyBase}_chunk_${chunkIndex}`);
        const chunk = str ? JSON.parse(str) : null;
        if (Array.isArray(chunk) && chunk.length > 0) {
          this.topicQuestionsFullCache = this.topicQuestionsFullCache.concat(chunk);
          this.topicQuestionsLoadedCount = Math.min(this.topicQuestionsFullCache.length, this.topicQuestionsCacheTotal);
          this.updateSubsourceOptionsFromList(this.topicQuestionsFullCache);
        } else break;
      } catch (_) {
        break;
      }
    }
  }

  onTopicQuestionsPageChange(page: number): void {
    this.topicQuestionsPage = page;
    this.ensureChunksLoadedForCurrentPage();
    const totalPages = this.topicQuestionsTotalPages;
    if (page >= totalPages && this.topicQuestionsCacheTotal >= this.Q999_MAX && !this._hasShown999LimitAlert) {
      this._hasShown999LimitAlert = true;
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('You have reached the end of the first 999 questions. Apply filters to narrow results or view different chapters/topics.');
      }
    }
    this.cdr.detectChanges();
    setTimeout(() => {
      this.measureOptionsLayouts();
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      }
    }, 80);
  }

  /** True when we are on the last page of the 999 cache and there may be more questions beyond 999. */
  get showApplyFilterMessage(): boolean {
    if (this.topicQuestionsFullCache.length === 0 || this.topicQuestionsCacheTotal < this.Q999_MAX) return false;
    return this.topicQuestionsPage >= this.topicQuestionsTotalPages;
  }

  private loadQuestionsByTopics(): void {
    const sub = this.primarySubject;
    if (!sub || !this.selectedTopicIds.size) return;
    this.topicQuestionsLoaded = false;
    const all: any[] = [];
    const seenIds = new Set<number>();
    let pending = this.selectedTopicIds.size;
    const chapterParam = this.selectedChapterIds.size === 1
      ? (this.chapters.find(c => this.selectedChapterIds.has(c.id))?.name)
      : undefined;
    this.selectedTopicIds.forEach(topicId => {
      const topicName = this.topics.find(t => t.id === topicId)?.name ?? topicId;
      this.apiService.getQuestionListByTopic({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr,
        chapter: chapterParam || undefined,
        topic: topicName
      }).subscribe({
        next: (res) => {
          (res.questions || []).forEach((q: any) => {
            if (all.length >= 999) return;
            const qid = q.qid;
            if (qid != null && !seenIds.has(qid)) {
              seenIds.add(qid);
              all.push(q);
            }
          });
          pending--;
          if (pending === 0) {
            const slice = all.slice(0, 999);
            this._topicQuestionsLegacy = slice.sort((a: any, b: any) => {
              const na = a.qid != null ? Number(a.qid) : NaN;
              const nb = b.qid != null ? Number(b.qid) : NaN;
              if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
              return String(a.qid ?? '').localeCompare(String(b.qid ?? ''));
            });
            this.updateSubsourceOptions();
            this.applyPendingFilterStateSourcesYearsQuestions();
            this.topicQuestionsLoaded = true;
            setTimeout(() => this.measureOptionsLayouts(), 80);
          }
        },
        error: () => {
          pending--;
          if (pending === 0) {
            const slice = all.slice(0, 999);
            this._topicQuestionsLegacy = slice.sort((a: any, b: any) => {
              const na = a.qid != null ? Number(a.qid) : NaN;
              const nb = b.qid != null ? Number(b.qid) : NaN;
              if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
              return String(a.qid ?? '').localeCompare(String(b.qid ?? ''));
            });
            this.updateSubsourceOptions();
            this._pendingFilterState = null;
            this.topicQuestionsLoaded = true;
            setTimeout(() => this.measureOptionsLayouts(), 80);
          }
        }
      });
    });
  }

  /** Parse subsource string into tokens { source, year } e.g. "BB'17", "CB'16" -> [{source:'BB',year:'17'},{source:'CB',year:'16'}]. */
  private parseSubsourceTokens(subsource: string): { source: string; year: string }[] {
    const s = (subsource != null ? String(subsource).trim() : '').replace(/^["']|["']$/g, '').trim();
    if (!s) return [];
    const tokens: { source: string; year: string }[] = [];
    const parts = s.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
    const re = /^([A-Za-z0-9\-]+)'(\d{2})$/;
    for (const part of parts) {
      const m = part.match(re);
      if (m) tokens.push({ source: m[1], year: m[2] });
    }
    return tokens;
  }

  /** Display string for question subsource (all sources for this qid) – shown at bottom-right of question block. No double quotes in UI (e.g. SB'23 not "SB'23"). */
  getSubsourceDisplay(q: any): string {
    if (!q) return '';
    const raw = q.subsource != null ? String(q.subsource).trim() : '';
    if (!raw) {
      const tokens = this.parseSubsourceTokens(raw || '');
      return tokens.length ? tokens.map(t => `${t.source}'${t.year}`).join(', ') : '';
    }
    return raw.replace(/"/g, '');
  }

  isLoved(qid: number | string): boolean {
    return this.lovedQids.has(qid);
  }

  toggleLove(qid: number | string, event?: Event): void {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (this.lovedQids.has(qid)) this.lovedQids.delete(qid);
    else this.lovedQids.add(qid);
    this.lovedQids = new Set(this.lovedQids);
    this.cdr.detectChanges();
  }

  /** Disappear question: hide from list until user restores it from Disappeared Questions (Live). Stored in user settings by qid. */
  onDisappearTopicQuestion(itemOrQid: number | string | { q: any }, event?: Event): void {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    const q = itemOrQid && typeof itemOrQid === 'object' && itemOrQid.q ? itemOrQid.q : null;
    const qid = q ? (q.qid ?? itemOrQid) : itemOrQid;
    if (q) {
      this.disappearedQuestions.addWithData(qid, { question: q.question, option_1: q.option_1, option_2: q.option_2, option_3: q.option_3, option_4: q.option_4, answer: q.answer, explanation: q.explanation, type: q.type });
    } else {
      this.disappearedQuestions.add(qid);
    }
    this.selectedQuestionIds.delete(qid);
    if (this.editingQid === qid) this.editingQid = null;
    this.showDisappearAlert = false;
    this.disappearAlertMessage = 'Question hidden. Restore it from Disappeared Questions.';
    this.cdr.detectChanges();
    this.showDisappearAlert = true;
    this.cdr.detectChanges();
    setTimeout(() => { this.showDisappearAlert = false; this.cdr.detectChanges(); }, 4000);
  }

  /** Loose equality so number vs string qid still matches (e.g. 123 and "123"). */
  isEditingItem(qid: number | string): boolean {
    return this.editingQid != null && this.editingQid == qid;
  }

  trackByQuestionQid(_index: number, item: { q: any; fullIndex: number }): number | string {
    return item.q?.qid ?? _index;
  }

  startEdit(item: { q: any; fullIndex: number }, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const q = item.q;
    this.editingQid = q != null ? q.qid : null;
    this.editForm = {
      question: (q.question != null ? String(q.question) : '').trim(),
      option_1: (q.option_1 != null ? String(q.option_1) : '').trim(),
      option_2: (q.option_2 != null ? String(q.option_2) : '').trim(),
      option_3: (q.option_3 != null ? String(q.option_3) : '').trim(),
      option_4: (q.option_4 != null ? String(q.option_4) : '').trim()
    };
    this.cdr.detectChanges();
  }

  cancelEdit(event?: Event): void {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    this.editingQid = null;
    this.cdr.detectChanges();
  }

  /** Escape HTML so diff markup is safe. */
  private escapeHtml(s: string): string {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Character-level diff for admin: deleted = bold+del darkred, added = bold blue.
   * Plain approved text is embedded via wrapPendingFieldWithPlainPlaintext for DB approve.
   */
  private buildPendingEditDiffHtml(oldText: string, newText: string): string {
    const parts = diffChars(oldText, newText);
    let out = '';
    for (const p of parts) {
      const esc = this.escapeHtml(p.value);
      if (p.added) {
        out += `<b style="color:blue">${esc}</b>`;
      } else if (p.removed) {
        out += `<b><del style="color:darkred">${esc}</del></b>`;
      } else {
        out += esc;
      }
    }
    return out;
  }

  /** Embed UTF-8 plain (base64) so approve strips diff markup without parsing HTML. */
  private wrapPendingFieldWithPlainPlaintext(plainNew: string, diffHtml: string): string {
    return `${CERADIP_PLAIN_PREFIX}${utf8ToBase64(plainNew)}-->${diffHtml}`;
  }

  /** Value for pending row: unchanged plain, or preamble + diff HTML. */
  private pendingEditFieldValue(orig: string, cur: string, hasOriginal: boolean): string {
    if (cur === orig) {
      return hasOriginal ? orig : cur;
    }
    return this.wrapPendingFieldWithPlainPlaintext(cur, this.buildPendingEditDiffHtml(orig, cur));
  }

  submitPendingEdit(event?: Event): void {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (!this.apiService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    if (this.editingQid == null) return;
    const list = this.getTopicQuestionsFilteredSorted();
    const original = list.find((q: any) => q?.qid === this.editingQid);
    const oq = (v: any) => (v != null ? String(v) : '').trim();
    const origQuestion = original ? oq(original.question) : '';
    const origOpt1 = original ? oq(original.option_1) : '';
    const origOpt2 = original ? oq(original.option_2) : '';
    const origOpt3 = original ? oq(original.option_3) : '';
    const origOpt4 = original ? oq(original.option_4) : '';
    if (original) {
      const noChange =
        this.editForm.question === origQuestion &&
        this.editForm.option_1 === origOpt1 &&
        this.editForm.option_2 === origOpt2 &&
        this.editForm.option_3 === origOpt3 &&
        this.editForm.option_4 === origOpt4;
      if (noChange) return;
    }
    const sub = this.primarySubject;
    const str = (v: any) => (v != null ? String(v).trim() : '') || '';
    const q = this.editForm.question ?? '';
    const opt1 = this.editForm.option_1 ?? '';
    const opt2 = this.editForm.option_2 ?? '';
    const opt3 = this.editForm.option_3 ?? '';
    const opt4 = this.editForm.option_4 ?? '';
    const payload: any = {
      qid: this.editingQid != null ? String(this.editingQid) : '',
      status: 'Update',
      question: this.pendingEditFieldValue(origQuestion, q, !!original),
      option_1: this.pendingEditFieldValue(origOpt1, opt1, !!original),
      option_2: this.pendingEditFieldValue(origOpt2, opt2, !!original),
      option_3: this.pendingEditFieldValue(origOpt3, opt3, !!original),
      option_4: this.pendingEditFieldValue(origOpt4, opt4, !!original),
      explanation: original ? str(original.explanation) : '',
      explanation2: original ? str(original.explanation2) : '',
      explanation3: original ? str(original.explanation3) : ''
    };
    if (original) {
      if (original.answer != null) payload.answer = str(original.answer);
      if (original.type != null) payload.type = str(original.type);
      if (original.chapter_no != null) payload.chapter_no = str(original.chapter_no);
      if (original.topic_no != null) payload.topic_no = str(original.topic_no);
      if (original.subsource != null) payload.subsource = str(original.subsource);
      if (original.level != null) payload.level = str(original.level);
    }
    if (sub) {
      payload.level_tr = sub.level_tr;
      payload.class_level = sub.class_level;
      payload.subject_tr = sub.subject_tr;
      payload.table = this.subjectQuestionTableName(sub.level_tr, sub.class_level, sub.subject_tr);
      payload.chapter = this.currentChapter || undefined;
      payload.topic = this.topics.find(t => this.selectedTopicIds.has(t.id))?.name || (this.topics[0]?.name) || undefined;
    }
    this.apiService.submitPendingQuestionRequest(payload).subscribe({
      next: () => {
        this.showSuccessAlert = false;
        this.successAlertMessage = 'Thanks! Your changes have been submitted and are pending admin approval.';
        this.cdr.detectChanges();
        this.showSuccessAlert = true;
        this.cdr.detectChanges();
        this.editingQid = null;
        this.cdr.detectChanges();
      },
      error: () => this.cdr.detectChanges()
    });
  }

  /**
   * Subject question table name for pending requests (must match backend subject_question_table_name).
   * Used so approve writes to the same table the questions were loaded from.
   */
  private subjectQuestionTableName(levelTr: string, classLevel: string, subjectTr: string): string {
    const slug = (s: string) => {
      if (s == null || typeof s !== 'string') return 'unknown';
      let t = s.trim().toLowerCase().replace(/ /g, '_').replace(/-/g, '_');
      t = t.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'unknown';
      return t;
    };
    const a = slug(levelTr).slice(0, 12);
    const b = slug(classLevel).slice(0, 8);
    const c = slug(subjectTr).slice(0, 36);
    let name = `cheradip_${a}_${b}_${c}`.replace(/_+$/, '');
    if (name.length > 64) name = name.slice(0, 64).replace(/_+$/, '');
    return name;
  }

  /** True if question's subsource has at least one token matching selected source/year. */
  private questionMatchesSourceYear(q: any): boolean {
    const tokens = this.parseSubsourceTokens(q.subsource);
    // Keep questions with missing/invalid subsource visible even when source/year filters are active.
    // Many creative questions do not carry subsource tokens; hiding them makes them appear "missing".
    if (!tokens.length) return true;
    const noSource = this.selectedSources.size === 0;
    const noYear = this.selectedYears.size === 0;
    return tokens.some(t => (noSource || this.selectedSources.has(t.source)) && (noYear || this.selectedYears.has(t.year)));
  }

  private updateSubsourceOptions(): void {
    const sourceSet = new Set<string>();
    const yearSet = new Set<string>();
    (this.topicQuestions || []).forEach((q: any) => {
      this.parseSubsourceTokens(q.subsource).forEach(t => {
        sourceSet.add(t.source);
        yearSet.add(t.year);
      });
    });
    this.subsourceSources = Array.from(sourceSet).sort();
    this.subsourceYears = Array.from(yearSet).sort((a, b) => a.localeCompare(b));
    this.selectedSources = new Set([...this.selectedSources].filter(x => sourceSet.has(x)));
    this.selectedYears = new Set([...this.selectedYears].filter(x => yearSet.has(x)));
  }

  /** Sources shown in More Filters Source column: only those in API response; if institute type selected, only codes of that type. */
  get subsourceSourcesFiltered(): string[] {
    if (!this.selectedInstituteType) return this.subsourceSources;
    return this.subsourceSources.filter(code => this.instituteTypeByCode.get(code) === this.selectedInstituteType!);
  }

  private loadCheradipSources(): void {
    this.apiService.getCheradipSources().subscribe({
      next: (res) => {
        const list = res.sources || [];
        this.cheradipInstitutes = list;
        this.instituteTypeByCode = new Map(list.map((x: any) => [String(x.institute_code || '').trim(), String(x.institute_type || '').trim()]));
        const types = new Set(list.map((x: any) => String(x.institute_type || '').trim()).filter(Boolean));
        this.instituteTypes = Array.from(types).sort();
        this.loadingService.completeOne();
      },
      error: () => { this.cheradipInstitutes = []; this.instituteTypeByCode = new Map(); this.instituteTypes = []; this.loadingService.completeOne(); }
    });
  }

  get selectedInstituteTypeLabel(): string {
    if (!this.selectedInstituteType) return 'All types';
    return this.selectedInstituteType;
  }

  onInstituteTypeSelect(type: string | null): void {
    this.selectedInstituteType = type;
    this.instituteTypeDropdownOpen = false;
    this.saveFilterState();
  }

  toggleInstituteTypeDropdown(event?: MouseEvent): void {
    this.instituteTypeDropdownOpen = !this.instituteTypeDropdownOpen;
    if (this.instituteTypeDropdownOpen) setTimeout(() => this.positionDropdownPanel(event));
  }

  /**
   * Full list for display: from cache (sorted by qid) or topicQuestions, filtered by source/year/type and excluded disappeared.
   * @param useFullSubjectCache When true, use entire 999 subject cache for filtering (create/export/select-all), not only chunks loaded for the current list page.
   */
  private getTopicQuestionsFilteredSortedCore(applyTypeFilter: boolean, useFullSubjectCache = false): any[] {
    const filterDisappeared = (arr: any[]) => arr.filter((q: any) => !this.disappearedQuestions.isDisappeared(q?.qid));
    const filterByType = (arr: any[]) =>
      !applyTypeFilter || this.selectedQuestionTypes.size === 0
        ? arr
        : arr.filter((q: any) => this.selectedQuestionTypes.has(this.normalizeQuestionTypeLabel(q?.type)));
    if (this.topicQuestionsFullCache.length > 0) {
      const raw = useFullSubjectCache
        ? [...this.topicQuestionsFullCache]
        : this.topicQuestionsFullCache.slice(0, this.topicQuestionsLoadedCount);
      const sorted = [...raw].sort((a: any, b: any) => {
        const na = a.qid != null ? Number(a.qid) : NaN;
        const nb = b.qid != null ? Number(b.qid) : NaN;
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a.qid ?? '').localeCompare(String(b.qid ?? ''));
      });
      const bySourceYear = (this.selectedSources.size === 0 && this.selectedYears.size === 0)
        ? sorted
        : sorted.filter((q: any) => this.questionMatchesSourceYear(q));
      return filterDisappeared(filterByType(bySourceYear));
    }
    const list = (this.selectedSources.size === 0 && this.selectedYears.size === 0)
      ? this.topicQuestions
      : this.topicQuestions.filter((q: any) => this.questionMatchesSourceYear(q));
    return filterDisappeared(filterByType(list));
  }

  getTopicQuestionsFilteredSorted(): any[] {
    return this.getTopicQuestionsFilteredSortedCore(true);
  }

  /** Displayed list: current page (30 items) from filtered+sorted list, with fullIndex for layout. */
  getDisplayedQuestions(): { q: any; fullIndex: number }[] {
    const list = this.getTopicQuestionsFilteredSorted();
    const page = this.effectiveTopicQuestionsPage;
    const start = (page - 1) * this.Q999_PAGE_SIZE;
    const pageList = list.slice(start, start + this.Q999_PAGE_SIZE);
    return pageList.map((q: any, i: number) => ({ q, fullIndex: start + i }));
  }

  get allSourcesSelected(): boolean {
    const list = this.subsourceSourcesFiltered;
    return list.length > 0 && this.selectedSources.size === list.length;
  }

  get allYearsSelected(): boolean {
    return this.subsourceYears.length > 0 && this.selectedYears.size === this.subsourceYears.length;
  }

  get moreFiltersLabel(): string {
    if (this.selectedSources.size === 0 && this.selectedYears.size === 0) return 'More Filters';
    const s = this.selectedSources.size;
    const y = this.selectedYears.size;
    if (s && y) return `More Filters (${s}×${y})`;
    if (s) return `More Filters (${s} source${s > 1 ? 's' : ''})`;
    return `More Filters (${y} year${y > 1 ? 's' : ''})`;
  }

  onSourceSelectAllToggle(): void {
    if (this.allSourcesSelected) this.selectedSources = new Set();
    else this.selectedSources = new Set(this.subsourceSources);
    this.saveFilterState();
  }

  onYearSelectAllToggle(): void {
    if (this.allYearsSelected) this.selectedYears = new Set();
    else this.selectedYears = new Set(this.subsourceYears);
    this.saveFilterState();
  }

  onSourceToggle(source: string): void {
    const next = new Set(this.selectedSources);
    if (next.has(source)) next.delete(source);
    else next.add(source);
    this.selectedSources = next;
    this.saveFilterState();
  }

  onYearToggle(year: string): void {
    const next = new Set(this.selectedYears);
    if (next.has(year)) next.delete(year);
    else next.add(year);
    this.selectedYears = next;
    this.saveFilterState();
  }

  clearSubsourceSelection(): void {
    this.selectedSources = new Set();
    this.selectedYears = new Set();
    this.saveFilterState();
  }

  /** Select All / Unselect All for the whole More Filters (both Source and Year columns). */
  get allSubsourceColumnsSelected(): boolean {
    return this.allSourcesSelected && this.allYearsSelected;
  }

  onSubsourceSelectAllToggle(): void {
    if (this.allSubsourceColumnsSelected) {
      this.selectedSources = new Set();
      this.selectedYears = new Set();
    } else {
      this.selectedSources = new Set(this.subsourceSourcesFiltered);
      this.selectedYears = new Set(this.subsourceYears);
    }
    this.saveFilterState();
  }

  toggleMoreFiltersDropdown(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.moreFiltersOpen = !this.moreFiltersOpen;
    if (this.moreFiltersOpen) {
      this.chapterDropdownOpen = false;
      this.topicDropdownOpen = false;
      setTimeout(() => this.positionDropdownPanel(event as MouseEvent));
    } else {
      this.instituteTypeDropdownOpen = false;
    }
  }

  /** Returns true if any option in the container has content wrapped to multiple lines. */
  private optionContentWrapped(container: HTMLElement): boolean {
    return this.optionContentWrappedCount(container) > 0;
  }

  /** Returns how many options in the container have content wrapped to multiple lines. */
  private optionContentWrappedCount(container: HTMLElement): number {
    const opts = container.querySelectorAll<HTMLElement>('.topic-question-opt');
    let count = 0;
    for (let i = 0; i < opts.length; i++) {
      const el = opts[i];
      const style = getComputedStyle(el);
      const lh = parseFloat(style.lineHeight);
      const fs = parseFloat(style.fontSize);
      const singleLineH = (isNaN(lh) || lh <= 0 ? fs * 1.2 : lh);
      if (el.offsetHeight > singleLineH * 1.25) count++;
    }
    return count;
  }

  /**
   * Option layout by wrap count (measured in 4-column layout):
   * - 0 options wrap → 4 columns, 1 row (1row)
   * - 1 or 2 options wrap → 2 columns, 2 rows (2row)
   * - 3 or 4 options wrap → 1 column, 4 rows (4row)
   */
  measureOptionsLayouts(): void {
    if (!this.topicQuestions?.length) {
      this.optionsLayouts = [];
      this.cdr.markForCheck();
      return;
    }
    const host = this.elRef.nativeElement;
    const listEl = host.querySelector<HTMLElement>('.topic-questions-list');
    const layouts: ('1row' | '2row' | '4row')[] = new Array(this.topicQuestions.length);
    for (let i = 0; i < this.topicQuestions.length; i++) layouts[i] = '2row';

    if (listEl) listEl.classList.add('topic-questions-list-measure');
    this.optionsLayouts = this.topicQuestions.map(() => '1row');
    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const items = host.querySelectorAll<HTMLElement>('.topic-question-item');
        const displayed = this.getDisplayedQuestions();
        items.forEach((item, domIndex) => {
          const fullIndex = (() => {
            const attr = item.getAttribute('data-full-index');
            if (attr !== null && attr !== '') {
              const n = parseInt(attr, 10);
              if (!isNaN(n) && n >= 0 && n < this.topicQuestions.length) return n;
            }
            return displayed[domIndex]?.fullIndex ?? domIndex;
          })();
          if (fullIndex < 0 || fullIndex >= this.topicQuestions.length) return;
          const cont = item.querySelector<HTMLElement>('.topic-question-options');
          if (!cont) return;
          const opts = cont.querySelectorAll<HTMLElement>('.topic-question-opt');
          if (opts.length <= 1) {
            layouts[fullIndex] = '1row';
            return;
          }
          const wrapCount = this.optionContentWrappedCount(cont);
          if (wrapCount === 0) layouts[fullIndex] = '1row';
          else if (wrapCount <= 2) layouts[fullIndex] = '2row';
          else layouts[fullIndex] = '4row';
        });
        if (listEl) listEl.classList.remove('topic-questions-list-measure');
        this.optionsLayouts = layouts.slice();
        this.cdr.markForCheck();
      });
    });
  }

  /** Max questions shown (no navigating past this). */
  readonly maxTopicQuestionsShown = 999;

  /** Serial number for loaded questions list: 001, 002, ... 999. */
  formatSl(index: number): string {
    return (index + 1).toString().padStart(3, '0');
  }

  /** Get question text for display; if type is সৃজনশীল প্রশ্ন, put each (ক)(খ)(গ)(ঘ) on a new line and use (ক)(খ)(গ)(ঘ) labels. */
  getQuestionDisplayText(q: { question?: unknown; type?: string }): string {
    const raw = q?.question != null ? String(q.question).trim() : '';
    if (!raw) return '';
    const prepared = formatMaybeCProgramQuestionText(raw);
    const type = (q?.type ?? '').toString().trim();
    if (type !== 'সৃজনশীল প্রশ্ন') return prepared;
    const withNewlines = prepared
      .replace(/([^\n])\s*(ক\.|খ\.|গ\.|ঘ\.)/g, '$1\n$2')
      .replace(/\n{2,}/g, '\n');
    const dottedToParen = withNewlines
      .replace(/ক\./g, '(ক)')
      .replace(/খ\./g, '(খ)')
      .replace(/গ\./g, '(গ)')
      .replace(/ঘ\./g, '(ঘ)');
    return dottedToParen
      .replace(/\s*(\(ক\)|\(খ\)|\(গ\)|\(ঘ\))/g, '\n$1')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  /** Split CQ by (ক)(খ)(গ) or (ক)(খ)(গ)(ঘ) order in text — same rules as question creator. */
  private parseCreativeStructureFromParenMarkers(full: string): { intro: string; parts: string[] } | null {
    const pK = full.indexOf('(ক)');
    const pKh = full.indexOf('(খ)');
    const pG = full.indexOf('(গ)');
    const pGh = full.indexOf('(ঘ)');
    if (pK < 0 || pKh < 0 || pG < 0) return null;
    if (!(pK < pKh && pKh < pG)) return null;
    const intro = full.slice(0, pK).trim();
    if (pGh >= 0 && pGh > pG) {
      return {
        intro,
        parts: [
          full.slice(pK, pKh).trim(),
          full.slice(pKh, pG).trim(),
          full.slice(pG, pGh).trim(),
          full.slice(pGh).trim(),
        ],
      };
    }
    return {
      intro,
      parts: [
        full.slice(pK, pKh).trim(),
        full.slice(pKh, pG).trim(),
        full.slice(pG).trim(),
      ],
    };
  }

  /** For সৃজনশীল প্রশ্ন: { intro, parts }; parts get 22px indent on wrap. Otherwise { intro: full text, parts: [] }. */
  getQuestionDisplayStructure(q: { question?: unknown; type?: string }): { intro: string; parts: string[] } {
    const full = this.getQuestionDisplayText(q);
    if (!full) return { intro: '', parts: [] };
    const type = (q?.type ?? '').toString().trim();
    if (type !== 'সৃজনশীল প্রশ্ন') return { intro: full, parts: [] };
    const byMarkers = this.parseCreativeStructureFromParenMarkers(full);
    if (byMarkers) return byMarkers;
    const lines = full.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length <= 1) return { intro: full, parts: [] };
    const intro = lines[0];
    const parts = lines.slice(1);
    return { intro, parts };
  }

  /**
   * CQ sub-section marks at the right of each (ক)–(ঘ) block: 3 parts → 2+4+4; 4 parts → 1+2+3+4 (Bengali digits).
   */
  creativeSubpartMarkBn(partCount: number, partIndexZeroBased: number): string | null {
    const bn = '০১২৩৪৫৬৭৮৯';
    const toBn = (n: number) =>
      String(n)
        .split('')
        .map((c) => (/^\d$/.test(c) ? bn[parseInt(c, 10)] ?? c : c))
        .join('');
    if (partCount === 3 && partIndexZeroBased >= 0 && partIndexZeroBased < 3) {
      return toBn([2, 4, 4][partIndexZeroBased]);
    }
    if (partCount === 4 && partIndexZeroBased >= 0 && partIndexZeroBased < 4) {
      return toBn([1, 2, 3, 4][partIndexZeroBased]);
    }
    return null;
  }

  /** Display text for option value (plain text; JSON has been removed from DB). */
  getOptionDisplayText(opt: unknown): string {
    if (opt == null) return '';
    const raw = typeof opt === 'string' ? opt.trim() : String(opt);
    return formatMaybeCProgramQuestionText(raw);
  }

  toggleQuestionSelection(qid: number | string): void {
    if (this.selectedQuestionIds.has(qid)) {
      this.selectedQuestionIds.delete(qid);
    } else {
      this.selectedQuestionIds.add(qid);
    }
    this.selectedQuestionIds = new Set(this.selectedQuestionIds);
    this.saveFilterState();
  }

  /** Row click: toggle selection when clicking anywhere except the checkbox (checkbox (change) handles itself). */
  onQuestionRowClick(event: MouseEvent, qid: number | string): void {
    const target = event.target as HTMLElement;
    if (target.closest('input[type="checkbox"]')) return;
    this.toggleQuestionSelection(qid);
  }

  /** Sync selection from checkbox (change) so the check icon shows when clicking the box. */
  setQuestionSelection(qid: number | string, checked: boolean): void {
    if (checked) {
      this.selectedQuestionIds.add(qid);
    } else {
      this.selectedQuestionIds.delete(qid);
    }
    this.selectedQuestionIds = new Set(this.selectedQuestionIds);
    this.saveFilterState();
  }

  isQuestionSelected(qid: number | string): boolean {
    return this.selectedQuestionIds.has(qid);
  }

  /** True when all displayed (possibly subsource-filtered) questions are selected. */
  get allTopicQuestionsSelected(): boolean {
    const displayed = this.getDisplayedQuestions();
    return displayed.length > 0 && displayed.every(item => this.selectedQuestionIds.has(item.q.qid));
  }

  /** Toggle between select all and unselect all for displayed questions. */
  toggleSelectAllTopicQuestions(): void {
    const displayed = this.getDisplayedQuestions();
    if (this.allTopicQuestionsSelected) {
      const toRemove = new Set(displayed.map(item => item.q.qid));
      this.selectedQuestionIds = new Set([...this.selectedQuestionIds].filter(id => !toRemove.has(id)));
    } else {
      displayed.forEach(item => this.selectedQuestionIds.add(item.q.qid));
      this.selectedQuestionIds = new Set(this.selectedQuestionIds);
    }
    this.saveFilterState();
  }

  selectAllTopicQuestions(): void {
    const full = this.getTopicQuestionsFilteredSortedCore(true, true);
    this.selectedQuestionIds = new Set(full.map((q: any) => q.qid));
    this.saveFilterState();
  }

  clearTopicQuestionSelection(): void {
    this.selectedQuestionIds = new Set();
    this.saveFilterState();
  }

  /** Total selected count (all pages); shown on Create Question button only. */
  get selectedCount(): number {
    return this.selectedQuestionIds?.size ?? 0;
  }

  /** Selected count on current page only; shown in header "X Selected of ...". */
  get selectedCountOnCurrentPage(): number {
    const displayed = this.getDisplayedQuestions();
    return displayed.filter(item => this.selectedQuestionIds?.has(item.q.qid)).length;
  }

  /**
   * Checkbox-selected questions for the creator: resolved from the full subject cache (or legacy list),
   * by qid only — does not re-apply the Type dropdown, source/year, or list pagination filters.
   */
  get selectedQuestionsForCreate(): any[] {
    const ids = this.selectedQuestionIds;
    if (!ids?.size) return [];
    const source =
      this.topicQuestionsFullCache.length > 0
        ? this.topicQuestionsFullCache
        : this._topicQuestionsLegacy || [];
    const out: any[] = [];
    const seen = new Set<number | string>();
    for (const q of source) {
      const id = q?.qid;
      if (id == null || !ids.has(id) || this.disappearedQuestions.isDisappeared(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(q);
    }
    out.sort((a: any, b: any) => {
      const na = a?.qid != null ? Number(a.qid) : NaN;
      const nb = b?.qid != null ? Number(b.qid) : NaN;
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return String(a?.qid ?? '').localeCompare(String(b?.qid ?? ''));
    });
    return out;
  }

  /** Live Chat – open chat or external link. */
  onLiveChat(): void {
    // TODO: open live chat widget or navigate to chat
  }

  /** Navigate to create page with selected questions (click on "Create Question (N Selected)"). */
  goToCreateQuestion(): void {
    const questions = this.selectedQuestionsForCreate;
    if (!questions.length) return;
    this.saveFilterState();
    const sub = this.primarySubject;
    const firstTopic = this.selectedTopicIds.size ? (this.topics.find(t => this.selectedTopicIds.has(t.id))?.name ?? '') : '';
    const questionTypes =
      this.selectedQuestionTypes.size > 0 ? Array.from(this.selectedQuestionTypes) : undefined;
    this.router.navigate(['/question/create'], {
      state: {
        questions,
        questionTypes,
        context: {
          level_tr: this.selectedLevel,
          class_level: this.selectedClass,
          group: this.selectedGroup || undefined,
          subject_tr: sub?.subject_tr,
          subject_code: sub?.subject_code,
          ...(sub?.sq === 25 || sub?.sq === 30 ? { sq: sub.sq } : {}),
          ...this.subjectMetaForCreateContext(sub ?? null),
          chapter: this.currentChapter,
          topic: firstTopic
        }
      }
    });
  }

  loadQuestionForEdit(qid: number | string): void {
    this.apiService.getQuestionById(qid).subscribe({
      next: (q) => { this.editQuestion = q; },
      error: () => { this.isFormMode = false; this.loadData(); }
    });
  }

  updateBreadcrumb(): void {
    this.breadcrumbItems = [];
    if (this.currentSubject) {
      this.breadcrumbItems.push({ label: this.currentSubject });
    }
    if (this.currentChapter) {
      this.breadcrumbItems.push({ label: this.currentChapter });
    }
  }

  loadData(): void {
    if (this.currentSubject && this.currentChapter) {
      this.loadQuestions();
    }
  }

  /** Load topics for the given chapter (for new-question form dropdown). */
  loadFormTopics(chapterIdOrName: string): void {
    const sub = this.primarySubject;
    if (!sub) {
      this.formTopics = [];
      return;
    }
    this.apiService.getQuestionTopics({
      level_tr: sub.level_tr,
      class_level: sub.class_level,
      subject_tr: sub.subject_tr,
      chapter: chapterIdOrName
    }).subscribe({
      next: (res) => {
        this.formTopics = res.topics || [];
        this.sortTopicsByNo(this.formTopics);
      },
      error: () => { this.formTopics = []; }
    });
  }

  loadChapters(): void {
    const sub = this.primarySubject;
    if (sub) {
      this.apiService.getQuestionChapters({
        level_tr: sub.level_tr,
        class_level: sub.class_level,
        subject_tr: sub.subject_tr
      }).subscribe({
        next: (res) => {
          this.chapters = res.chapters || [];
          this.sortChaptersByNo(this.chapters);
        },
        error: () => { this.chapters = []; }
      });
    }
  }

  loadQuestions(): void {
    const params: any = {};
    if (this.currentSubject) params['subject'] = this.currentSubject;
    if (this.currentChapter) params['chapter'] = this.currentChapter;
    this.apiService.getQuestions(params).subscribe({
      next: (data: any) => {
        this.questions = Array.isArray(data) ? data : (data?.results ?? data?.data ?? []);
        this.totalPages = Math.max(1, Math.ceil(this.questions.length / 10));
      },
      error: () => { this.questions = []; this.totalPages = 1; }
    });
  }

  onSearch(searchTerm: string): void {
    // Implement search functionality
  }

  /** Navigate to question-creator page with no selection (from "Create Question" button when nothing selected). */
  goToQuestionCreator(): void {
    this.router.navigate(['/question/create'], {
      state: {
        questions: [],
        context: this.primarySubject ? {
          level_tr: this.selectedLevel,
          class_level: this.selectedClass,
          group: this.selectedGroup || undefined,
          subject_tr: this.primarySubject.subject_tr,
          subject_code: this.primarySubject.subject_code,
          ...(this.primarySubject.sq === 25 || this.primarySubject.sq === 30 ? { sq: this.primarySubject.sq } : {}),
          ...this.subjectMetaForCreateContext(this.primarySubject),
          chapter: this.currentChapter,
          topic: this.selectedTopicIds.size ? (this.topics.find(t => this.selectedTopicIds.has(t.id))?.name ?? '') : ''
        } : undefined
      }
    });
  }

  /** Navigate to the "add new question" form on the question page (writes to cheradip_pending_question_request). Used by FAB. */
  goToAddNewQuestion(): void {
    const sub = this.primarySubject;
    const subjectTr = this.currentSubject || sub?.subject_tr;
    const chapterName = this.currentChapter;
    if (subjectTr && chapterName) {
      this.router.navigate(['/question', subjectTr, 'chapter', chapterName, 'new']);
    } else {
      this.router.navigate(['/question']);
    }
  }

  /** Open modal to choose EIIN, exam name, and set; then navigate to creator with auto-save. */
  openSmartQuestionCreatorModal(): void {
    this.smartCreatorModalError = '';
    this.smartCreatorModalEiin = '000000';
    this.smartCreatorModalExamKey = 'election';
    this.smartCreatorModalSetLetter = null;
    this.smartCreatorModalOpen = true;
  }

  closeSmartQuestionCreatorModal(): void {
    this.smartCreatorModalOpen = false;
    this.smartCreatorModalError = '';
  }

  /** True if any checkbox-selected question is MCQ (বহুনির্বাচনি). */
  smartCreatorModalSelectionHasMcq(): boolean {
    return this.selectedQuestionsForCreate.some((q) => this.showEditOptions(q));
  }

  confirmSmartQuestionCreatorModal(): void {
    const questions = this.selectedQuestionsForCreate;
    if (!questions.length) {
      this.smartCreatorModalError = 'Select one or more questions in the list, then try again.';
      return;
    }
    this.smartCreatorModalOpen = false;
    this.smartCreatorModalError = '';
    this.saveFilterState();
    const sub = this.primarySubject;
    const firstTopic = this.selectedTopicIds.size ? (this.topics.find(t => this.selectedTopicIds.has(t.id))?.name ?? '') : '';
    const questionTypes =
      this.selectedQuestionTypes.size > 0 ? Array.from(this.selectedQuestionTypes) : undefined;
    const eiin = (this.smartCreatorModalEiin ?? '').trim() || '000000';
    this.router.navigate(['/question/create'], {
      state: {
        smartCreator: true,
        questions,
        questionTypes,
        smartCreatorHeader: {
          eiin,
          examTypeKey: this.smartCreatorModalExamKey,
          mcqSetLetter: this.smartCreatorModalSelectionHasMcq() ? this.smartCreatorModalSetLetter : null,
        },
        context: sub
          ? {
              level_tr: this.selectedLevel,
              class_level: this.selectedClass,
              group: this.selectedGroup || undefined,
              subject_tr: sub.subject_tr,
              subject_code: sub.subject_code,
              ...(sub.sq === 25 || sub.sq === 30 ? { sq: sub.sq } : {}),
              ...this.subjectMetaForCreateContext(sub),
              chapter: this.currentChapter,
              topic: firstTopic,
            }
          : undefined,
      },
    });
  }

  onCreateQuestion(): void {
    this.goToAddNewQuestion();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadQuestions();
  }

  onQuestionSelect(question: any): void {
    const qid = question.qid;
    if (this.currentSubject && this.currentChapter && qid != null) {
      this.router.navigate(['/question', this.currentSubject, 'chapter', this.currentChapter, 'question', qid]);
    }
  }

  onQuestionDelete(qid: number | string): void {
    this.apiService.deleteQuestion(qid).subscribe({
      next: () => this.loadQuestions(),
      error: () => this.loadQuestions()
    });
  }

  onSaveQuestion(payload: any): void {
    if (this.editQuestion?.qid) {
      this.apiService.updateQuestion(this.editQuestion.qid, payload).subscribe({
        next: () => this.goBackToList(),
        error: () => {}
      });
    } else {
      const sub = this.primarySubject;
      const req: any = {
        level_tr: sub?.level_tr ?? '',
        class_level: sub?.class_level ?? this.selectedClass ?? '',
        subject_tr: this.currentSubject || payload.subject || '',
        chapter_no: (payload.chapter_no || (this.chapters.find(c => c.name === payload.chapter || c.id === payload.chapter)?.id)) ?? payload.chapter ?? '',
        chapter: payload.chapter || this.currentChapter || '',
        topic_no: payload.topic_no || '',
        topic: payload.topic || '',
        question: (payload.question || payload.text || '').trim(),
        option_1: payload.option_1,
        option_2: payload.option_2,
        option_3: payload.option_3,
        option_4: payload.option_4,
        answer: payload.answer || '',
        explanation: payload.explanation || '',
        explanation2: payload.explanation2,
        explanation3: payload.explanation3,
        type: payload.type || 'CQ'
      };
      this.apiService.submitPendingQuestionRequest(req).subscribe({
        next: () => this.goBackToList(),
        error: () => {}
      });
    }
  }

  onCancelForm(): void {
    this.goBackToList();
  }

  private goBackToList(): void {
    this.router.navigate(['/question', this.currentSubject, 'chapter', this.currentChapter]);
  }
}
