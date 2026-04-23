import { Component, ViewChild, ElementRef, OnInit, AfterViewInit, AfterViewChecked, ChangeDetectorRef } from '@angular/core';
import { ApiService, ScraperLibrary } from '../../../service/api.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
  selector: 'app-scraper',
  templateUrl: './scraper.component.html',
  styleUrls: ['./scraper.component.css'],
})
export class ScraperComponent implements OnInit, AfterViewInit, AfterViewChecked {
  @ViewChild('logBox') logBoxRef?: ElementRef<HTMLTextAreaElement>;
  private scrollLogToBottom = false;
  sitePreset: 'daricomma' | 'chorcha' | 'eprosnobank' | 'livemcq' | 'other' = 'daricomma';
  loginUrl = '';
  username = '';
  password = '';
  groups: { name: string; urls: string[] }[] = [{ name: 'Default', urls: [] }];
  selectedGroupIndex = 0;
  sessionId = '';
  loading = false;
  selectedLevel1 = '';
  selectedLevel2 = '';
  level1Options: { value: string; label: string }[] = [];
  level2Options: { value: string; label: string }[] = [];
  paths: { level1Value: string; level1Label: string; level2Value: string; level2Label: string }[] = [];
  apiBaseUrl = '';
  apiUrlTemplate = '';
  bearerToken = '';
  questionPerPage = 200;
  running = false;
  progress = 0;
  status = '';
  error = '';
  logText = '';
  private runAborted = false;

  appendLog(msg: string): void {
    const line = msg.trim();
    if (!line) return;
    this.logText = this.logText ? this.logText + '\n' + line : line;
    this.scrollLogToBottom = true;
  }

  ngAfterViewChecked(): void {
    if (this.scrollLogToBottom && this.logBoxRef?.nativeElement) {
      const el = this.logBoxRef.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.scrollLogToBottom = false;
    }
  }

  get selectedGroup(): { name: string; urls: string[] } | undefined {
    return this.groups[this.selectedGroupIndex];
  }

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private loadingService: LoadingService
  ) {
    this.loadHelper();
  }

  ngOnInit(): void {
    this.loadingService.setTotal(1);
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  loadHelper(skipRestoreLastSite = false): void {
    this.api.scraperHelperGet().subscribe({
      next: (res: { lastSite?: string; libraries?: Record<string, ScraperLibrary> }) => {
        const siteKey = (res?.lastSite || 'daricomma').toLowerCase();
        if (!skipRestoreLastSite && res?.lastSite && this.isSiteKey(siteKey)) {
          this.sitePreset = siteKey;
        }
        const lib = res?.libraries?.[this.sitePreset] as Record<string, unknown> | undefined;
        if (lib && typeof lib === 'object') {
          const get = (camel: string, snake: string) =>
            (lib[camel] ?? lib[snake] ?? '') as string;
          const getNum = (camel: string, snake: string) =>
            (lib[camel] ?? lib[snake] ?? 200) as number;
          this.loginUrl = (get('loginUrl', 'login_url') || '').trim();
          this.username = (get('username', 'username') || '').trim();
          this.password = (get('password', 'password') || '').trim();
          const g = (lib['groups'] as { name?: string; urls?: string[] }[] | undefined);
          this.groups = (g?.length ? g : [{ name: 'Default', urls: [] }]) as { name: string; urls: string[] }[];
          this.selectedGroupIndex = 0;
          this.apiBaseUrl = (get('apiBaseUrl', 'api_base_url') || '').trim();
          this.apiUrlTemplate = (get('apiUrlTemplate', 'api_url_template') || '').trim();
          this.bearerToken = (get('bearerToken', 'bearer_token') || '').trim();
          const qpp = getNum('questionPerPage', 'question_per_page');
          this.questionPerPage = typeof qpp === 'number' && qpp > 0 ? qpp : 200;
        } else {
          this.loginUrl = '';
          this.username = '';
          this.password = '';
          this.groups = [{ name: 'Default', urls: [] }];
          this.selectedGroupIndex = 0;
          this.apiBaseUrl = '';
          this.apiUrlTemplate = '';
          this.bearerToken = '';
          this.questionPerPage = 200;
        }
        this.loadCredentialsFromStorage();
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadCredentialsFromStorage();
        this.cdr.detectChanges();
      },
    });
  }

  private static readonly SCRAPER_USERNAME_KEY = 'scraper_username';
  private static readonly SCRAPER_PASSWORD_KEY = 'scraper_password';

  private loadCredentialsFromStorage(): void {
    try {
      const u = localStorage.getItem(ScraperComponent.SCRAPER_USERNAME_KEY);
      if (u !== null) this.username = u;
      const p = localStorage.getItem(ScraperComponent.SCRAPER_PASSWORD_KEY);
      if (p !== null) this.password = p;
      if (u === null && this.username) localStorage.setItem(ScraperComponent.SCRAPER_USERNAME_KEY, this.username);
      if (p === null && this.password) localStorage.setItem(ScraperComponent.SCRAPER_PASSWORD_KEY, this.password);
    } catch (_) {}
  }

  private saveCredentialsToStorage(): void {
    try {
      localStorage.setItem(ScraperComponent.SCRAPER_USERNAME_KEY, this.username || '');
      localStorage.setItem(ScraperComponent.SCRAPER_PASSWORD_KEY, this.password || '');
    } catch (_) {}
  }

  private isSiteKey(s: string): s is 'daricomma' | 'chorcha' | 'eprosnobank' | 'livemcq' | 'other' {
    return ['daricomma', 'chorcha', 'eprosnobank', 'livemcq', 'other'].includes(s);
  }

  persistHelper(): void {
    this.saveCredentialsToStorage();
    const lib: ScraperLibrary = {
      loginUrl: this.loginUrl,
      username: this.username,
      password: this.password,
      groups: this.groups.map((g) => ({ name: g.name, urls: g.urls?.slice() ?? [] })),
      apiBaseUrl: this.apiBaseUrl,
      apiUrlTemplate: this.apiUrlTemplate,
      bearerToken: this.bearerToken,
      questionPerPage: this.questionPerPage,
    };
    this.api.scraperHelperSave({ lastSite: this.sitePreset, libraries: { [this.sitePreset]: lib } }).subscribe({
      next: () => {},
      error: () => {},
    });
  }

  onSitePresetChange(): void {
    this.loadHelper(true);
  }

  openLoginPage(): void {
    if (this.loading || !this.loginUrl) return;
    this.saveCredentialsToStorage();
    this.loading = true;
    this.error = '';
    this.appendLog('Opening login page: ' + this.loginUrl);
    this.api.scraperLoadWebsite(this.loginUrl, false).subscribe({
      next: (res: { session_id?: string; error?: string }) => {
        if (res?.error) {
          this.error = res.error;
          this.appendLog('Error: ' + res.error);
          this.loading = false;
          return;
        }
        const sid = res?.session_id;
        if (!sid) {
          this.error = 'No session_id returned';
          this.appendLog('Error: No session_id returned');
          this.loading = false;
          return;
        }
        this.sessionId = sid;
        if (this.username?.trim() && this.password?.trim()) {
          this.appendLog('Login page loaded. Logging in immediately...');
          setTimeout(() => {
            this.api.scraperDaricommaLogin(sid, this.loginUrl, this.username.trim(), this.password).subscribe({
              next: (loginRes: { error?: string }) => {
                if (loginRes?.error) {
                  this.error = loginRes.error;
                  this.appendLog('Login error: ' + loginRes.error);
                } else {
                  this.saveCredentialsToStorage();
                  this.appendLog('Logged in. Go to the academic page, then click Run.');
                  this.status = 'Logged in. Navigate to the academic page, then click Run.';
                }
                this.loading = false;
              },
              error: (err: unknown) => {
                this.error = (err as { message?: string })?.message || 'Login failed';
                this.appendLog('Error: ' + this.error);
                this.loading = false;
              },
            });
          }, 400);
        } else {
          this.appendLog('Login page opened. Enter username and password above, then click Login again to log in automatically.');
          this.status = 'Login page opened. Enter credentials and click Login again to log in.';
          this.loading = false;
        }
      },
      error: (err: unknown) => {
        this.error = (err as { message?: string })?.message || 'Load website failed';
        this.appendLog('Error: ' + this.error);
        this.loading = false;
      },
    });
  }

  closeBrowser(): void {
    if (!this.sessionId) return;
    this.api.scraperCloseSession(this.sessionId).subscribe({
      next: () => {
        this.sessionId = '';
        this.appendLog('Browser closed.');
      },
      error: () => {
        this.sessionId = '';
      },
    });
  }

  loadLevel1OptionsFromPage(): void {
    if (!this.sessionId) return;
    this.loading = true;
    this.api.scraperCaptureMantine(this.sessionId, 0, []).subscribe({
      next: (res: { options?: { value: string; text?: string }[] }) => {
        this.level1Options = (res?.options ?? []).map((o) => ({ value: o.value, label: o.text ?? o.value }));
        this.appendLog('Found ' + this.level1Options.length + ' subject(s).');
        this.loading = false;
      },
      error: () => {
        this.level1Options = [];
        this.loading = false;
      },
    });
  }

  onLevel1Change(): void {
    this.selectedLevel2 = '';
    this.level2Options = [];
    if (!this.selectedLevel1) return;
    this.api.scraperCaptureMantine(this.sessionId, 1, [this.selectedLevel1]).subscribe({
      next: (res: { options?: { value: string; text?: string }[] }) => {
        this.level2Options = (res?.options ?? []).map((o) => ({ value: o.value, label: o.text ?? o.value }));
      },
      error: () => {
        this.level2Options = [];
      },
    });
  }

  addCurrentPath(): void {
    if (!this.selectedLevel1 || !this.selectedLevel2) return;
    const l1 = this.level1Options.find((o) => o.value === this.selectedLevel1);
    const l2 = this.level2Options.find((o) => o.value === this.selectedLevel2);
    this.paths.push({
      level1Value: this.selectedLevel1,
      level1Label: l1?.label ?? this.selectedLevel1,
      level2Value: this.selectedLevel2,
      level2Label: l2?.label ?? this.selectedLevel2,
    });
  }

  removePath(i: number): void {
    this.paths.splice(i, 1);
  }

  pathDisplayLabel(p: { level1Value?: string; level1Label?: string; level2Value?: string; level2Label?: string }, which: 'level1' | 'level2'): string {
    if (which === 'level1') return (p as any).level1Label ?? (p as any).level1Value ?? '';
    return (p as any).level2Label ?? (p as any).level2Value ?? '';
  }

  private deriveChapterNo(label: string): string {
    if (!label || typeof label !== 'string') return '';
    const s = label.trim();
    const bengaliToAscii: Record<string, string> = { '\u09E6': '0', '\u09E7': '1', '\u09E8': '2', '\u09E9': '3', '\u09EA': '4', '\u09EB': '5', '\u09EC': '6', '\u09ED': '7', '\u09EE': '8', '\u09EF': '9' };
    let digits = '';
    for (const c of s) {
      if (/\d/.test(c)) digits += c;
      else if (bengaliToAscii[c] !== undefined) digits += bengaliToAscii[c];
    }
    if (digits.length === 0) return '';
    const numStr = digits.slice(0, 2);
    const n = parseInt(numStr, 10);
    if (Number.isNaN(n)) return '';
    return n < 10 ? '0' + n : String(n);
  }

  private extractQuestionsFromResponse(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    const inner = data.data || data;
    if (Array.isArray(inner?.questions)) return inner.questions;
    if (Array.isArray(inner)) return inner;
    if (Array.isArray(data.questions)) return data.questions;
    return [];
  }

  run(): void {
    if (this.running || !this.sessionId) return;
    const questionUrl = (this.apiUrlTemplate || this.apiBaseUrl || '').replace(/\/+$/, '');
    if (!questionUrl) {
      this.error = 'Set API Base URL or API URL Template for this site';
      return;
    }
    const groupName = (this.selectedGroup?.name || this.sitePreset || 'default').replace(/\s+/g, '_');
    const website = (this.sitePreset || 'daricomma').trim();

    const pathsToRun = this.paths.length > 0 ? this.paths : (this.selectedLevel1 && this.selectedLevel2
      ? [{
          level1Value: this.selectedLevel1,
          level1Label: this.level1Options.find((o) => o.value === this.selectedLevel1)?.label ?? this.selectedLevel1,
          level2Value: this.selectedLevel2,
          level2Label: this.level2Options.find((o) => o.value === this.selectedLevel2)?.label ?? this.selectedLevel2,
        }]
      : []);

    if (pathsToRun.length > 0) {
      this.runWithPaths(pathsToRun, groupName, website, questionUrl);
      return;
    }

    this.running = true;
    this.runAborted = false;
    this.error = '';
    this.status = 'Loading subjects from page…';
    this.appendLog('Loading subjects from page…');
    this.api.scraperCaptureMantine(this.sessionId, 0, []).subscribe({
      next: (res: { options?: { value: string; text?: string }[] }) => {
        this.level1Options = (res?.options ?? []).map((o) => ({ value: o.value, label: o.text ?? o.value }));
        this.appendLog('Found ' + this.level1Options.length + ' subject(s). Running like script: one subject at a time (Level1 → Level2 options → fetch each chapter).');
        this.runOneSubjectAtATime(0, groupName, website, questionUrl);
      },
      error: () => {
        this.running = false;
        this.error = 'Could not load subjects. Make sure you are on the academic page.';
        this.appendLog('Could not load subjects.');
      },
    });
  }

  /** Script-like flow: for each Level1, select it, get Level2 options, then select Level1+Level2 per chapter and fetch. No pre-loading all chapters. */
  private runOneSubjectAtATime(
    level1Index: number,
    groupName: string,
    website: string,
    questionUrl: string,
    state?: { totalWork: number; doneWork: number }
  ): void {
    const safeName = (s: string) => (s || '').replace(/\s+/g, '_');
    const workState = state ?? { totalWork: 0, doneWork: 0 };

    if (level1Index === 0 && !state) {
      this.running = true;
      this.runAborted = false;
      this.error = '';
      this.progress = 0;
      this.status = 'Starting…';
      this.appendLog('Run started. Processing one subject at a time (Level1 → Level2 options → fetch each chapter).');
      this.cdr.detectChanges();
    }

    const params: Record<string, string> = {};
    if (this.questionPerPage > 0) params['questionPerPage'] = String(this.questionPerPage);
    const headers: Record<string, string> = {};
    if (this.bearerToken) headers['Authorization'] = `Bearer ${this.bearerToken}`;
    const apiBasePrefix = (this.apiBaseUrl || 'https://api.daricomma.com/v2/question/').replace(/\/+$/, '');

    const processNextSubject = (): void => {
      if (this.runAborted) {
        this.status = 'Stopped.';
        this.appendLog('Stopped.');
        this.running = false;
        this.cdr.detectChanges();
        return;
      }
      if (level1Index >= this.level1Options.length) {
        this.status = 'Done.';
        this.appendLog('Done.');
        this.running = false;
        this.progress = workState.totalWork > 0 ? 100 : 100;
        this.cdr.detectChanges();
        this.api.scraperClearApiFile().subscribe({
          next: () => this.appendLog('Cleared Scrape/api.txt (all tasks done).'),
          error: () => {},
        });
        this.api.scraperRootGet().subscribe({
          next: (r: { path?: string }) => {
            const root = (r?.path || 'Desktop').replace(/\//g, '\\');
            this.appendLog('Files are saved at ' + root + '\\Scraper\\' + website + '\\' + groupName);
          },
          error: () => this.appendLog('Files are saved at Desktop\\Scraper\\' + website + '\\' + groupName),
        });
        return;
      }

      const level1 = this.level1Options[level1Index];
      const level1Safe = safeName(level1.label);
      this.api.scraperFileExists(groupName, level1Safe, website).subscribe({
        next: (res: { exists?: boolean }) => {
          if (res?.exists) {
            const pathMsg = (res as { path?: string }).path ? ' at ' + (res as { path: string }).path : '';
            this.appendLog('Skipping subject "' + level1.label + '" (already have ' + level1Safe + '.json & .csv' + pathMsg + ').');
            this.runOneSubjectAtATime(level1Index + 1, groupName, website, questionUrl, workState);
            return;
          }
          this.status = 'Loading chapters for ' + level1.label + '…';
          this.appendLog('[' + (level1Index + 1) + '/' + this.level1Options.length + '] Selecting Level1: ' + level1.label);
          this.cdr.detectChanges();
          this.api.scraperCaptureMantine(this.sessionId, 1, [level1.label]).subscribe({
            next: (res2: { options?: { value: string; text?: string }[] }) => {
              const chapters = (res2?.options ?? []).map((o) => ({ value: o.value, label: o.text ?? o.value }));
              if (chapters.length === 0) {
                this.appendLog('  No chapters for this subject, skipping.');
                this.runOneSubjectAtATime(level1Index + 1, groupName, website, questionUrl, workState);
                return;
              }
              workState.totalWork += 1 + chapters.length;
              this.appendLog('   ✓ Level2 API response loaded successfully (' + chapters.length + ' chapters).');
              chapters.forEach((ch, i) => this.appendLog('      ' + (i + 1) + '. ' + ch.label));
              this.cdr.detectChanges();
              const addDone = (): void => {
                workState.doneWork++;
                this.progress = workState.totalWork > 0 ? (workState.doneWork / workState.totalWork) * 100 : 100;
                this.cdr.detectChanges();
              };
              this.runChaptersForSubject(level1, chapters, 0, level1Index, [], {
                groupName,
                website,
                questionUrl,
                params,
                headers,
                safeName,
                apiBasePrefix,
                workState,
                totalWork: () => workState.totalWork,
                doneWork: () => workState.doneWork,
                addDone,
              });
            },
            error: () => {
              this.appendLog('  Could not load chapters for ' + level1.label + ', skipping.');
              this.runOneSubjectAtATime(level1Index + 1, groupName, website, questionUrl, workState);
            },
          });
        },
        error: () => {
          this.appendLog('Skipping "' + level1.label + '" (file check failed).');
          this.runOneSubjectAtATime(level1Index + 1, groupName, website, questionUrl, workState);
        },
      });
    };

    processNextSubject();
  }

  private runChaptersForSubject(
    level1: { value: string; label: string },
    chapters: { value: string; label: string }[],
    chapterIdx: number,
    level1Index: number,
    subjectQuestionsSoFar: any[],
    ctx: {
      groupName: string;
      website: string;
      questionUrl: string;
      params: Record<string, string>;
      headers: Record<string, string>;
      safeName: (s: string) => string;
      apiBasePrefix: string;
      workState?: { totalWork: number; doneWork: number };
      totalWork: () => number;
      doneWork: () => number;
      addDone: () => void;
    }
  ): void {
    const { groupName, website, questionUrl, params, headers, safeName, apiBasePrefix, addDone } = ctx;
    const level1Safe = safeName(level1.label);

    const goNextChapter = (questionsSoFar: any[]): void => {
      if (this.runAborted) {
        this.status = 'Stopped.';
        this.appendLog('Stopped.');
        this.running = false;
        this.cdr.detectChanges();
        return;
      }
      if (chapterIdx >= chapters.length) {
        this.api.scraperSaveSubject({
          group: groupName,
          website,
          level1_name: level1.label,
          questions: questionsSoFar,
        }).subscribe({
          next: (saveRes: { error?: string }) => {
            if (saveRes?.error) {
              this.error = (this.error ? this.error + '; ' : '') + saveRes.error;
              this.appendLog('  ⚠ Save subject: ' + saveRes.error);
            } else {
              this.appendLog('📦 Completed subject file: ' + level1Safe + '.json & .csv');
            }
            addDone();
            this.runOneSubjectAtATime(level1Index + 1, groupName, website, questionUrl, ctx.workState);
          },
          error: (err: unknown) => {
            const errMsg = (err as { message?: string })?.message || 'Save subject failed';
            this.error = (this.error ? this.error + '; ' : '') + errMsg;
            this.appendLog('  ✗ ' + errMsg);
            addDone();
            this.runOneSubjectAtATime(level1Index + 1, groupName, website, questionUrl, ctx.workState);
          },
        });
        return;
      }

      const chapter = chapters[chapterIdx];
      const level2Value = chapter.value;
      const level2Label = chapter.label;
      const derivedChapterNo = this.deriveChapterNo(level2Label);
      const baseName = level1Safe + '_' + safeName(level2Label);
      const filename = baseName + '.json';
      const numL1 = this.level1Options.length;
      const idx1 = level1Index + 1;
      const idx2 = chapterIdx + 1;
      const numL2 = chapters.length;
      const percent = numL1 > 0 ? ((idx1 - 1) + idx2 / numL2) / numL1 * 100 : 0;
      this.status = `Overall ${percent.toFixed(1)}% | L1 ${idx1}/${numL1}, L2 ${idx2}/${numL2}`;
      this.progress = Math.min(percent, 100);
      this.appendLog('   [' + idx2 + '/' + numL2 + '] Selecting Level2: ' + level2Label);
      this.cdr.detectChanges();

      const doFetchAndSave = (baseUrl: string): void => {
        this.appendLog('   📡 Fetching questions for ' + level1.label + ' -> ' + level2Label);
        this.cdr.detectChanges();
        this.api.scraperFetchAndSave({
          group: groupName,
          website,
          base_url: baseUrl,
          params: { ...params, chapter_id: level2Value, subject: level1.label, subject_id: level1.value },
          headers,
          filename,
          level1_name: level1.label,
          level2_label: level2Label,
          chapter_no: derivedChapterNo,
          session_id: this.sessionId,
        }).subscribe({
          next: (res: { error?: string; data?: any }) => {
            const questions = this.extractQuestionsFromResponse(res?.data);
            questions.forEach((q: any) => {
              if (q && typeof q === 'object') {
                q._chapter = level2Label;
                q._chapter_no = (q.chapter_no ?? q.chapterNo ?? q.chapter?.chapter_no ?? q.chapter?.chapterNo ?? derivedChapterNo) || derivedChapterNo;
                q._level1 = level1.label;
              }
            });
            const nextQuestions = questionsSoFar.concat(questions);
            if (res?.error) {
              this.error = (this.error ? this.error + '; ' : '') + res.error;
              this.appendLog('    ⚠ ' + res.error);
            } else {
              this.appendLog('✅ Saved ' + baseName + '.json & .csv');
            }
            addDone();
            this.cdr.detectChanges();
            this.runChaptersForSubject(level1, chapters, chapterIdx + 1, level1Index, nextQuestions, ctx);
          },
          error: (err: unknown) => {
            const errMsg = (err as { message?: string })?.message || 'Request failed';
            this.error = (this.error ? this.error + '; ' : '') + errMsg;
            this.appendLog('    ✗ ' + errMsg);
            addDone();
            this.runChaptersForSubject(level1, chapters, chapterIdx + 1, level1Index, questionsSoFar, ctx);
          },
        });
      };

      this.api.scraperCaptureQuestionUrl(this.sessionId, level1.value, level2Value, apiBasePrefix, level1.label, level2Label).subscribe({
        next: (capRes: { url?: string }) => {
          let requestUrl = (capRes?.url || '').trim();
          if (!requestUrl) {
            requestUrl = questionUrl;
            if (requestUrl.includes('[subjectId]') || requestUrl.includes('[chapterId]')) {
              requestUrl = requestUrl.replace(/\[subjectId\]/g, level1.value).replace(/\[chapterId\]/g, level2Value);
            }
            this.appendLog('    Using template URL (no captured URL).');
          } else {
            this.appendLog('   ✓ Using API: ' + requestUrl.substring(0, 60) + (requestUrl.length > 60 ? '...' : ''));
          }
          doFetchAndSave(requestUrl);
        },
        error: () => {
          let requestUrl = questionUrl;
          if (requestUrl.includes('[subjectId]') || requestUrl.includes('[chapterId]')) {
            requestUrl = requestUrl.replace(/\[subjectId\]/g, level1.value).replace(/\[chapterId\]/g, level2Value);
          }
          this.appendLog('    Capture API URL failed, using template.');
          doFetchAndSave(requestUrl);
        },
      });
    };

    goNextChapter(subjectQuestionsSoFar);
  }

  private runWithPaths(
    pathsToRun: { level1Value?: string; level1Label?: string; level2Value?: string; level2Label?: string }[],
    groupName: string,
    website: string,
    questionUrl: string
  ): void {
    const normalized = pathsToRun.map((p: any) => ({
      level1Value: p.level1Value ?? p.level1Label ?? '',
      level1Label: p.level1Label ?? p.level1Value ?? '',
      level2Value: p.level2Value ?? p.level2Label ?? '',
      level2Label: p.level2Label ?? p.level2Value ?? '',
    }));
    const subjectMap = new Map<string, { level1Label: string; chapters: { value: string; label: string }[] }>();
    for (const p of normalized) {
      const key = p.level1Value || 'subject';
      if (!subjectMap.has(key)) subjectMap.set(key, { level1Label: p.level1Label, chapters: [] });
      const ent = subjectMap.get(key)!;
      if (!ent.chapters.some((c) => c.value === p.level2Value)) {
        ent.chapters.push({ value: p.level2Value, label: p.level2Label });
      }
    }
    const subjects: { level1Value: string; level1Label: string; chapters: { value: string; label: string }[] }[] = [];
    subjectMap.forEach((ent, level1Value) => subjects.push({ level1Value, level1Label: ent.level1Label, chapters: ent.chapters }));

    this.running = true;
    this.runAborted = false;
    this.error = '';
    this.progress = 0;
    this.status = 'Starting…';
    this.appendLog('Run started. Subjects: ' + subjects.length + ', chapters: ' + pathsToRun.length);
    this.cdr.detectChanges();

    const params: Record<string, string> = {};
    if (this.questionPerPage > 0) params['questionPerPage'] = String(this.questionPerPage);
    const headers: Record<string, string> = {};
    if (this.bearerToken) headers['Authorization'] = `Bearer ${this.bearerToken}`;

    const safeName = (s: string) => (s || '').replace(/\s+/g, '_');
    let doneWork = 0;
    let totalWork = 0;
    let subjectsToRun: { level1Value: string; level1Label: string; chapters: { value: string; label: string }[] }[] = [];

    const checkAllThenRun = (subIndex: number): void => {
      if (this.runAborted) {
        this.status = 'Stopped.';
        this.appendLog('Stopped.');
        this.running = false;
        this.cdr.detectChanges();
        return;
      }
      if (subIndex >= subjects.length) {
        totalWork = subjectsToRun.reduce((s, sub) => s + sub.chapters.length + 1, 0);
        if (totalWork === 0) {
          this.status = 'Done.';
          this.appendLog('Done (all subjects skipped).');
          this.running = false;
          this.cdr.detectChanges();
          return;
        }
        this.appendLog('Subjects to run: ' + subjectsToRun.length + ', steps: ' + totalWork);
        this.progress = 0;
        this.cdr.detectChanges();
        runSubjectByIndex(0);
        return;
      }
      const sub = subjects[subIndex];
      const level1Safe = safeName(sub.level1Label);
      this.api.scraperFileExists(groupName, level1Safe, website).subscribe({
        next: (res: { exists?: boolean }) => {
          if (res?.exists) {
            this.appendLog('Skipping subject "' + sub.level1Label + '" (level1.json & level1.csv already exist).');
          } else {
            subjectsToRun.push(sub);
          }
          checkAllThenRun(subIndex + 1);
        },
        error: () => {
          this.appendLog('Skipping subject "' + sub.level1Label + '" (could not check file_exists).');
          checkAllThenRun(subIndex + 1);
        },
      });
    };

    const runSubjectByIndex = (subIndex: number): void => {
      if (this.runAborted) {
        this.status = 'Stopped.';
        this.appendLog('Stopped.');
        this.running = false;
        return;
      }
      if (subIndex >= subjectsToRun.length) {
        this.status = 'Done.';
        this.appendLog('Done.');
        this.running = false;
        this.progress = 100;
        this.cdr.detectChanges();
        this.api.scraperClearApiFile().subscribe({
          next: () => this.appendLog('Cleared Scrape/api.txt (all tasks done).'),
          error: () => {},
        });
        this.api.scraperRootGet().subscribe({
          next: (r: { path?: string }) => {
            const root = (r?.path || 'Desktop').replace(/\//g, '\\');
            const savePath = root + '\\Scraper\\' + website + '\\' + groupName;
            this.appendLog('Files are saved at ' + savePath);
          },
          error: () => {
            this.appendLog('Files are saved at Desktop\\Scraper\\' + website + '\\' + groupName);
          },
        });
        return;
      }
      const sub = subjectsToRun[subIndex];
      const level1Safe = safeName(sub.level1Label);
      const chapterCount = sub.chapters.length;
      let subjectQuestions: any[] = [];
      let chapterIdx = 0;

      const runNextChapter = (): void => {
        if (this.runAborted) {
          this.status = 'Stopped.';
          this.appendLog('Stopped.');
          this.running = false;
          this.cdr.detectChanges();
          return;
        }
        if (chapterIdx >= sub.chapters.length) {
          this.api.scraperSaveSubject({
            group: groupName,
            website,
            level1_name: sub.level1Label,
            questions: subjectQuestions,
          }).subscribe({
            next: (saveRes: { error?: string }) => {
              if (saveRes?.error) {
                this.error = (this.error ? this.error + '; ' : '') + saveRes.error;
                this.appendLog('  ⚠ Save subject: ' + saveRes.error);
              } else {
                this.appendLog('📦 Completed subject file: ' + level1Safe + '.json & .csv');
              }
              doneWork++;
              const numL1 = subjectsToRun.length;
              this.progress = numL1 > 0 ? (subIndex + 1) / numL1 * 100 : 100;
              this.cdr.detectChanges();
              runSubjectByIndex(subIndex + 1);
            },
            error: (err: unknown) => {
              const errMsg = (err as { message?: string })?.message || 'Save subject failed';
              this.error = (this.error ? this.error + '; ' : '') + errMsg;
              this.appendLog('  ✗ ' + errMsg);
              doneWork++;
              const numL1 = subjectsToRun.length;
              this.progress = numL1 > 0 ? (subIndex + 1) / numL1 * 100 : 100;
              this.cdr.detectChanges();
              runSubjectByIndex(subIndex + 1);
            },
          });
          return;
        }
        const chapter = sub.chapters[chapterIdx];
        const level2Value = chapter.value;
        const level2Label = chapter.label;
        const derivedChapterNo = this.deriveChapterNo(level2Label);
        const baseNameR = level1Safe + '_' + safeName(level2Label);
        const filename = baseNameR + '.json';
        const numL1R = subjectsToRun.length;
        const idx1R = subIndex + 1;
        const idx2R = chapterIdx + 1;
        const numL2R = chapterCount;
        const percentR = numL1R > 0 ? ((idx1R - 1) + idx2R / numL2R) / numL1R * 100 : 0;
        this.status = `Overall ${percentR.toFixed(1)}% | L1 ${idx1R}/${numL1R}, L2 ${idx2R}/${numL2R}`;
        this.progress = Math.min(percentR, 100);
        this.appendLog('   [' + idx2R + '/' + numL2R + '] Selecting Level2: ' + level2Label);
        this.cdr.detectChanges();

        const doFetchAndSave = (baseUrl: string): void => {
          this.appendLog('   📡 Fetching questions for ' + sub.level1Label + ' -> ' + level2Label);
          this.cdr.detectChanges();
          this.api.scraperFetchAndSave({
            group: groupName,
            website,
            base_url: baseUrl,
            params: {
              ...params,
              chapter_id: level2Value,
              subject: sub.level1Label,
              subject_id: sub.level1Value,
            },
            headers,
            filename,
            level1_name: sub.level1Label,
            level2_label: level2Label,
            chapter_no: derivedChapterNo,
            session_id: this.sessionId,
          }).subscribe({
            next: (res: { error?: string; data?: any }) => {
              const questions = this.extractQuestionsFromResponse(res?.data);
              questions.forEach((q: any) => {
                if (q && typeof q === 'object') {
                  q._chapter = level2Label;
                  q._chapter_no = (q.chapter_no ?? q.chapterNo ?? q.chapter?.chapter_no ?? q.chapter?.chapterNo ?? derivedChapterNo) || derivedChapterNo;
                  q._level1 = sub.level1Label;
                }
              });
              subjectQuestions = subjectQuestions.concat(questions);
              if (res?.error) {
                if (res.error !== 'Scraper stopped') {
                  this.error = (this.error ? this.error + '; ' : '') + res.error;
                  this.appendLog('    ⚠ ' + res.error);
                }
              } else {
                this.appendLog('✅ Saved ' + baseNameR + '.json & .csv');
              }
              doneWork++;
              const numL1 = subjectsToRun.length;
              const idx2Done = chapterIdx + 1;
              this.progress = numL1 > 0 ? ((subIndex + (idx2Done / chapterCount)) / numL1) * 100 : 100;
              this.cdr.detectChanges();
              chapterIdx++;
              runNextChapter();
            },
            error: (err: unknown) => {
              const errMsg = (err as { message?: string })?.message || 'Request failed';
              this.error = (this.error ? this.error + '; ' : '') + errMsg;
              this.appendLog('    ✗ ' + errMsg);
              doneWork++;
              const numL1 = subjectsToRun.length;
              const idx2Done = chapterIdx + 1;
              this.progress = numL1 > 0 ? ((subIndex + (idx2Done / chapterCount)) / numL1) * 100 : 100;
              this.cdr.detectChanges();
              chapterIdx++;
              runNextChapter();
            },
          });
        };

        const apiBasePrefix = (this.apiBaseUrl || 'https://api.daricomma.com/v2/question/').replace(/\/+$/, '');
        this.api.scraperCaptureQuestionUrl(this.sessionId, sub.level1Value, level2Value, apiBasePrefix, sub.level1Label, level2Label).subscribe({
          next: (capRes: { url?: string }) => {
            let requestUrl = (capRes?.url || '').trim();
            if (!requestUrl) {
              requestUrl = questionUrl;
              if (requestUrl.includes('[subjectId]') || requestUrl.includes('[chapterId]')) {
                requestUrl = requestUrl.replace(/\[subjectId\]/g, sub.level1Value).replace(/\[chapterId\]/g, level2Value);
              }
              this.appendLog('    Using template URL (no captured URL).');
            } else {
              this.appendLog('   ✓ Using API: ' + requestUrl.substring(0, 60) + (requestUrl.length > 60 ? '...' : ''));
            }
            doFetchAndSave(requestUrl);
          },
          error: () => {
            let requestUrl = questionUrl;
            if (requestUrl.includes('[subjectId]') || requestUrl.includes('[chapterId]')) {
              requestUrl = requestUrl.replace(/\[subjectId\]/g, sub.level1Value).replace(/\[chapterId\]/g, level2Value);
            }
            this.appendLog('    Capture API URL failed, using template.');
            doFetchAndSave(requestUrl);
          },
        });
      };
      runNextChapter();
    };

    checkAllThenRun(0);
  }

  /** Like Ctrl+C: stop scraping and close browser. */
  stop(): void {
    this.runAborted = true;
    this.running = false;
    this.status = 'Stopped. Browser closed.';
    this.appendLog('Stopped. Browser closed.');
    if (this.sessionId) {
      const sid = this.sessionId;
      this.sessionId = '';
      this.cdr.detectChanges();
      this.api.scraperCloseSession(sid).subscribe({
        next: () => this.cdr.detectChanges(),
        error: () => this.cdr.detectChanges(),
      });
    } else {
      this.cdr.detectChanges();
    }
  }
}
