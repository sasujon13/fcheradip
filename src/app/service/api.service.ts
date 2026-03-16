import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, tap } from 'rxjs/operators';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ScraperLibrary {
  loginUrl?: string;
  username?: string;
  password?: string;
  groups: { name: string; urls: string[] }[];
  apiBaseUrl?: string;
  apiUrlTemplate?: string;
  bearerToken?: string;
  questionPerPage?: number;
}

export interface CreatedQuestionSet {
  id: number;
  name: string;
  question_header: string;
  questions: any[];
  counter: number;
  file_name_base: string;
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  baseUrl = environment.apiUrl;
  public search = new BehaviorSubject<string>("");
  userData: any;

  constructor(private http: HttpClient) { }

  getNotifications(): Observable<any> {
    const url = `${this.baseUrl}/notification/`;
    return this.http.get<any>(url).pipe(catchError(() => of([])));
  }

  getProducts() {
    const url = `${this.baseUrl}/item/`;
    return this.http.get<any>(url)
      .pipe(map((res: any) => {
        return res;
      }))
  }
  getDivisions(): Observable<string[]> {
    const url = `${this.baseUrl}/divisions/`;
    return this.http.get<string[]>(url);
  }

  getDistricts(division: string): Observable<string[]> {
    const url = `${this.baseUrl}/districts/?division=${division}`;
    return this.http.get<string[]>(url);
  }

  getThanas(division: string, district: string): Observable<string[]> {
    const url = `${this.baseUrl}/thanas/?division=${division}&district=${district}`;
    return this.http.get<string[]>(url);
  }

  /** Divisions from Location table by country (for profile, etc.). */
  getDivisionsByCountry(countryCode: string): Observable<string[]> {
    if (!countryCode) return of([]);
    return this.http.get<string[]>(`${this.baseUrl}/locations/divisions/`, {
      params: { country_code: countryCode }
    });
  }

  /** Districts from Location table by country and division. */
  getDistrictsByCountry(countryCode: string, division: string): Observable<string[]> {
    if (!countryCode || !division) return of([]);
    return this.http.get<string[]>(`${this.baseUrl}/locations/districts/`, {
      params: { country_code: countryCode, division }
    });
  }

  /** Thanas from Location table by country, division, district. */
  getThanasByCountry(countryCode: string, division: string, district: string): Observable<string[]> {
    if (!countryCode || !division || !district) return of([]);
    return this.http.get<string[]>(`${this.baseUrl}/locations/thanas/`, {
      params: { country_code: countryCode, division, district }
    });
  }

  /** Get profile from Customer (GET /api/signup_profile/?username=xxx&acctype=yyy). */
  getProfile(username: string, acctype?: string): Observable<any> {
    const params: any = { username };
    if (acctype) params.acctype = acctype;
    return this.http.get<any>(`${this.baseUrl}/signup_profile/`, { params });
  }

  getRDistricts(): Observable<string[]> {
    const url = `${this.baseUrl}/recommend7/unique_districts/`;
    return this.http.get<string[]>(url);
  }

  getRThanas(district: string): Observable<string[]> {
    const url = `${this.baseUrl}/recommend7/unique_thanas/?district=${district}`;
    return this.http.get<string[]>(url);
  }

  getR5Districts(): Observable<string[]> {
    const url = `${this.baseUrl}/recommend5/unique_districts/`;
    return this.http.get<string[]>(url);
  }

  getR5Thanas(district: string): Observable<string[]> {
    const url = `${this.baseUrl}/recommend5/unique_thanas/?district=${district}`;
    return this.http.get<string[]>(url);
  }

  getR6Districts(): Observable<string[]> {
    const url = `${this.baseUrl}/recommend6/unique_districts/`;
    return this.http.get<string[]>(url);
  }

  getR6Thanas(district: string): Observable<string[]> {
    const url = `${this.baseUrl}/recommend6/unique_thanas/?district=${district}`;
    return this.http.get<string[]>(url);
  }

  login(username: string, password: string, countryCode?: string, foundIn?: string): Observable<any> {
    const loginData: any = { username, password };
    if (countryCode) loginData.countryCode = countryCode;
    if (foundIn) loginData.found_in = foundIn;
    return this.http.post(`${this.baseUrl}/login/`, loginData).pipe(
      tap((response: any) => {
        if (response) {
          const token = response.authToken || response.token || response;
          this.setToken(typeof token === 'string' ? token : (response.authToken || ''));
          localStorage.setItem('acctype', response.acctype ?? '');
          localStorage.setItem('fullName', response.fullName ?? '');
          localStorage.setItem('username', response.username ?? username);
          localStorage.setItem('division', response.division ?? '');
          localStorage.setItem('district', response.district ?? '');
          localStorage.setItem('thana', response.thana ?? '');
          localStorage.setItem('union', response.union ?? '');
          localStorage.setItem('village', response.village ?? '');
          localStorage.setItem('group', response.group ?? '');
          localStorage.setItem('gender', response.gender ?? '');
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('authToken', typeof token === 'string' ? token : (response.authToken || ''));
          localStorage.setItem('formData', JSON.stringify(loginData));
        }
      }),
      catchError((error) => {
        throw error;
      })
    );
  }


  myorder(username: string): Observable<any> {
    // const loginData = { username };
    // return this.http.post(`${this.baseUrl}/myorder/`, loginData)
    return this.http.get(`${this.baseUrl}/myorder/${username}/`);
  }


  signup(acctype: string, fullName: string, username: string, password: string, group: string, gender: string, division: string, district: string, thana: string, union: string, village: string): Observable<any> {

    const signupData = { acctype, fullName, username, password, group, gender, division, district, thana, union, village };
    return this.http.post(`${this.baseUrl}/signup/`, signupData).pipe(
      tap((response: any) => {
        if (response.token) {
          this.setToken(response.token);
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('authToken', response.token)
          localStorage.setItem('formData', JSON.stringify(signupData));
        }
      }),
      catchError((error) => {
        throw error;
      })
    );
  }

  update(
    username: string,
    acctype: string,
    fullName: string,
    group: string,
    gender: string,
    division: string,
    district: string,
    thana: string,
    union: string,
    village: string,
    password: string,
    countryCode?: string,
    dateOfBirth?: string | null
  ): Observable<any> {
    const signupData: any = {
      username,
      acctype,
      fullName,
      group,
      gender,
      division,
      district,
      thana,
      union,
      village,
      password
    };
    if (countryCode) signupData.country_code = countryCode;
    if (dateOfBirth != null && dateOfBirth !== '') signupData.date_of_birth = dateOfBirth;
    return this.http.post(`${this.baseUrl}/profile_update/`, signupData).pipe(
      tap((response: any) => {
        if (response.token) {
          this.setToken(response.token);
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('authToken', response.token);
          localStorage.setItem('formData', JSON.stringify(signupData));
        }
      }),
      catchError((error) => {
        throw error;
      })
    );
  }

  updatePassword(username: string, password: string, newpassword: string): Observable<any> {
    const passUpdateData = { username, password, newpassword };
    return this.http.post(`${this.baseUrl}/password_update/`, passUpdateData).pipe(
      tap((response: any) => {
        if (response.token) {
          this.setToken(response.token);
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('authToken', response.token)
          localStorage.setItem('formData', JSON.stringify(passUpdateData));
        }
      }),
      catchError((error) => {
        throw error;
      })
    );
  }

  updateMobile(username: string, newusername: string, password: string): Observable<any> {
    const mobileUpdateData = { username, newusername, password };
    return this.http.post(`${this.baseUrl}/mobile_update/`, mobileUpdateData).pipe(
      tap((response: any) => {
        if (response.token) {
          this.setToken(response.token);
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('authToken', response.token)
          localStorage.setItem('formData', JSON.stringify(mobileUpdateData));
        }
      }),
      catchError((error) => {
        throw error;
      })
    );
  }

  

  getInstitutes2(url?: string): Observable<any> {
    return this.http.get(url ?? `${this.baseUrl}/institutes/?page=1`);
  }

  private setToken(token: string): void {
    localStorage.setItem('authToken', token);
  }

  getToken(): string | null {
    return localStorage.getItem('authToken');
  }

  /** Whether the user is considered logged in (has auth token). */
  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  /** GET customer settings (requires auth). Returns { settings }. */
  getCustomerSettings(): Observable<{ settings: Record<string, any> }> {
    return this.http.get<{ settings: Record<string, any> }>(`${this.baseUrl}/customer_settings/`);
  }

  /** POST customer settings (merge). Body: { settings }. Returns { settings }. */
  updateCustomerSettings(settings: Record<string, any>): Observable<{ settings: Record<string, any> }> {
    return this.http.post<{ settings: Record<string, any> }>(`${this.baseUrl}/customer_settings/`, { settings });
  }

  /**
   * POST export_questions: generate PDF or DOCX. Returns blob. Body: questions, questionHeader, pageSize,
   * marginTop, marginRight, marginBottom, marginLeft, format ('pdf'|'docx'), filename (base without extension).
   */
  exportQuestions(payload: {
    questions: any[];
    questionHeader: string;
    pageSize: string;
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
    format: 'pdf' | 'docx';
    filename: string;
  }): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/export_questions/`, payload, { responseType: 'blob' });
  }

  /**
   * POST export_questions_bulk: body { items: [ { questions, questionHeader, filename, pageSize?, marginTop?, ... }, ... ] }.
   * Returns a single ZIP blob (all PDFs). One download.
   */
  exportQuestionsBulk(items: Array<{
    questions: any[];
    questionHeader: string;
    filename: string;
    pageSize?: string;
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
  }>): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/export_questions_bulk/`, { items }, { responseType: 'blob' });
  }

  /** Created question sets: list */
  getCreatedQuestionSets(): Observable<CreatedQuestionSet[]> {
    return this.http.get<CreatedQuestionSet[]>(`${this.baseUrl}/created_question_sets/`);
  }

  /** Created question sets: create (name, question_header, questions) */
  createQuestionSet(payload: { name: string; question_header: string; questions: any[] }): Observable<CreatedQuestionSet> {
    return this.http.post<CreatedQuestionSet>(`${this.baseUrl}/created_question_sets/`, payload);
  }

  /** Created question sets: get one */
  getCreatedQuestionSet(id: number): Observable<CreatedQuestionSet> {
    return this.http.get<CreatedQuestionSet>(`${this.baseUrl}/created_question_sets/${id}/`);
  }

  /** Created question sets: rename (PATCH name) */
  renameQuestionSet(id: number, name: string): Observable<{ name: string; file_name_base: string }> {
    return this.http.patch<{ name: string; file_name_base: string }>(`${this.baseUrl}/created_question_sets/${id}/`, { name });
  }

  /** Created question sets: delete */
  deleteQuestionSet(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/created_question_sets/${id}/`);
  }

  /** Returns { exists, found_in? }. found_in is set when exists is true (student|jobseeker|teacher|customer). */
  checkMobileNumberExists(username: string, countryCode?: string): Observable<{ exists: boolean; found_in?: string }> {
    let url = `${this.baseUrl}/username/?username=${encodeURIComponent(username)}`;
    if (countryCode) url += `&countryCode=${encodeURIComponent(countryCode)}`;
    return this.http.get<{ exists: boolean; found_in?: string }>(url);
  }

  /** Pass found_in from mobile check so password is validated only in that table. */
  checkPasswordExists(username: string, password: string, foundIn?: string, countryCode?: string): Observable<{ exists: boolean }> {
    let url = `${this.baseUrl}/password/?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    if (foundIn) url += `&found_in=${encodeURIComponent(foundIn)}`;
    if (countryCode) url += `&countryCode=${encodeURIComponent(countryCode)}`;
    return this.http.get<{ exists: boolean }>(url);
  }

  saveJsonData(jsonData: any) {
    return this.http.post(`${this.baseUrl}/save_json_data/`, jsonData);
  }

  /** Run scraper via backend (avoids CORS): fetches pages and returns combined JSON. */
  runScraper(payload: { base_url: string; params: any; headers: any; page_param?: string; delay_seconds?: number; chapter_name?: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/run_scraper/`, payload);
  }

  /** Fetch a single page (for progress bar). Returns { data, has_more }. */
  runScraperPage(payload: { base_url: string; params: any; headers: any; page_param?: string; page_number: number; delay_seconds?: number }): Observable<any> {
    return this.http.post(`${this.baseUrl}/run_scraper_page/`, payload);
  }

  /** Fetch from questions API and save. Pass session_id so backend uses same browser token (script: token from localStorage). Returns { ok, path, error?, data? }. */
  scraperFetchAndSave(payload: { group: string; website?: string; base_url: string; params: Record<string, string>; headers: Record<string, string>; filename: string; level1_name?: string; level2_label?: string; chapter_no?: string; session_id?: string }): Observable<{ ok?: boolean; path?: string; error?: string; data?: any }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/fetch_and_save/`, payload);
  }

  /** GET scraper/file_exists/?group=...&filename=...&website=... (base name). Returns { exists: boolean } if both .json and .csv exist. */
  scraperFileExists(group: string, filename: string, website?: string): Observable<{ exists: boolean }> {
    const params: { group: string; filename: string; website?: string } = { group, filename };
    if (website) params.website = website;
    return this.http.get<any>(`${this.baseUrl}/scraper/file_exists/`, { params });
  }

  /** POST scraper/save_subject/ { group, website?, level1_name, questions }. Writes to Scrape/{website}/{group}/. */
  scraperSaveSubject(payload: { group: string; website?: string; level1_name: string; questions: any[] }): Observable<{ ok?: boolean; path_json?: string; path_csv?: string; error?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/save_subject/`, payload);
  }

  /** POST scraper/clear_api_file/ – clear Scrape/api.txt (call when all tasks done, like script). */
  scraperClearApiFile(): Observable<{ ok?: boolean; error?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/clear_api_file/`, {});
  }

  /** GET scraper/root/ – current save folder root (custom or default Desktop). */
  scraperRootGet(): Observable<{ path: string }> {
    return this.http.get<any>(`${this.baseUrl}/scraper/root/`);
  }

  /** POST scraper/root/set/ – set save folder root so project works on any computer. */
  scraperRootSet(path: string): Observable<{ ok?: boolean; error?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/root/set/`, { path: path || '' });
  }

  /** GET scraper/default_root/ – default Desktop path for "Use default" button. */
  scraperDefaultRootGet(): Observable<{ path: string }> {
    return this.http.get<any>(`${this.baseUrl}/scraper/default_root/`);
  }

  /** GET scraper helper: { lastSite, libraries: { daricomma: {...}, other: {...} } } */
  scraperHelperGet(): Observable<{ lastSite: string; libraries: Record<string, ScraperLibrary> }> {
    return this.http.get<any>(`${this.baseUrl}/scraper/helper/`);
  }

  /** POST save scraper helper (lastSite + libraries). */
  scraperHelperSave(payload: { lastSite: string; libraries: Record<string, ScraperLibrary> }): Observable<{ ok?: boolean; error?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/helper/`, payload);
  }

  /** Load website in Selenium. headless=true uses headless Chrome (recommended for data load). Returns session_id. */
  scraperLoadWebsite(url: string, headless: boolean = true): Observable<{ session_id?: string; url?: string; error?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/load_website/`, { url, headless });
  }

  /** Navigate session browser to url. */
  scraperNavigate(sessionId: string, url: string): Observable<{ ok?: boolean; error?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/navigate/`, { session_id: sessionId, url });
  }

  /** Daricomma: sign in on login page. */
  scraperDaricommaLogin(sessionId: string, loginUrl: string, username: string, password: string): Observable<{ ok?: boolean; error?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/daricomma_login/`, { session_id: sessionId, login_url: loginUrl, username, password });
  }

  /** Mantine Select options: combobox_index 0=Level1, 1=Level2; previous_selections for Level2. */
  scraperCaptureMantine(sessionId: string, comboboxIndex: number, previousSelections: string[]): Observable<{ options: { value: string; text?: string }[]; error?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/capture_mantine/`, { session_id: sessionId, combobox_index: comboboxIndex, previous_selections: previousSelections });
  }

  /** Select Level1 & Level2 by visible text (script), capture question API URL from network. Returns { url } for use as base_url in fetch_and_save. */
  scraperCaptureQuestionUrl(
    sessionId: string,
    level1Value: string,
    level2Value: string,
    apiBasePrefix?: string,
    level1Label?: string,
    level2Label?: string
  ): Observable<{ url?: string; error?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/capture_question_url/`, {
      session_id: sessionId,
      level1_value: level1Value,
      level2_value: level2Value,
      level1_label: level1Label || level1Value,
      level2_label: level2Label || level2Value,
      api_base_prefix: apiBasePrefix || 'https://api.daricomma.com/v2/question/',
    });
  }

  /** Run full scraper (like pressing Enter in script): get Level1 from page, iterate subjects/chapters, fetch and save. Long-running. */
  scraperRunFull(payload: { session_id: string; group: string; website?: string; api_url_template?: string; api_base_url?: string; bearer_token?: string; question_per_page?: number }): Observable<{ ok?: boolean; error?: string; subjects?: number; chapters?: number }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/run_full/`, payload);
  }

  /** Capture dropdown options for level (native select). */
  scraperCaptureDropdown(sessionId: string, level: number, previousSelections: string[]): Observable<{ options: { value: string; text?: string }[]; error?: string; message?: string }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/capture_dropdown/`, { session_id: sessionId, level, previous_selections: previousSelections });
  }

  /** Close Selenium session. */
  scraperCloseSession(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/scraper/close_session/`, { session_id: sessionId });
  }

  /** Discover dropdowns on a page (Selenium). Returns groups by first dropdown name. */
  discoverScraperDropdowns(pageUrl: string): Observable<{ groups: { name: string; options: { value: string; text?: string }[] }[] }> {
    return this.http.get<any>(`${this.baseUrl}/scraper/discover_dropdowns/`, { params: { url: pageUrl } });
  }

  /** Get dynamic options for a level after previous selections (Selenium). */
  dynamicScraperDropdown(pageUrl: string, levelIndex: number, selections: string[]): Observable<{ options: { value: string; text?: string }[] }> {
    return this.http.post<any>(`${this.baseUrl}/scraper/dynamic_dropdown/`, { url: pageUrl, level_index: levelIndex, selections });
  }

  adminRedirect(){
    //return window.location.replace("http://127.0.0.1:8000/api/admin");
    window.location.href = `${this.baseUrl}/admin/`;
    return window.location.href;
  }

  getQuestions(filters?: any): Observable<any> {
    // If filters are passed, append them to the request parameters
    const params = filters ? { params: filters } : {};
    
    return this.http.get(`${this.baseUrl}/questions/`, params);
  }

  getSubjects(): Observable<any> {
    return this.http.get(`${this.baseUrl}/subjects/`);
  }

  getGroups(): Observable<any> {
    return this.http.get(`${this.baseUrl}/groups/`);
  }

  getInstitutes(): Observable<any> {
    return this.http.get(`${this.baseUrl}/institutes/`);
  }

  getChapters(): Observable<any> {
    return this.http.get(`${this.baseUrl}/chapters/`);
  }

  getTopics(): Observable<any> {
    return this.http.get(`${this.baseUrl}/topics/`);
  }

  getInstituteTypes(): Observable<any> {
    return this.http.get(`${this.baseUrl}/instituteTypes/`);
  }

  getYears(): Observable<any> {
    return this.http.get(`${this.baseUrl}/years/`);
  }

  getYearsByInstitute(instituteIds: string[]): Observable<any> {
    return this.http.get(`${this.baseUrl}/years/`, { params: { institutes: instituteIds } });
  }
  getInstitutesByInstituteType(typeIds: string[]): Observable<any> {
    return this.http.get(`${this.baseUrl}/institutes/`, { params: { instituteTypes: typeIds } });
  }
  getTopicsByChapter(chapterIds: string[]): Observable<any> {
    return this.http.get(`${this.baseUrl}/topics/`, { params: { chapters: chapterIds } });
  }
  getChaptersBySubject(subjectIds: string[]): Observable<any> {
    return this.http.get(`${this.baseUrl}/chapters/`, { params: { subjects: subjectIds } });
  }
  getSubjectsByGroup(groupIds: string[]): Observable<any> {
    return this.http.get(`${this.baseUrl}/subjects/`, { params: { groups: groupIds } });
  }

  getDepartments(): Observable<{ departments?: any[] }> {
    return this.http.get<{ departments?: any[] }>(`${this.baseUrl}/departments/`);
  }

  /** University departments from departments.json (Teacher Level = University). Worldwide, all disciplines. */
  getUniversityDepartments(): Observable<{ departments: any[]; count: number }> {
    return this.http.get<{ departments: any[]; count: number }>(`${this.baseUrl}/university_departments/`);
  }

  getGroupsByClass(classCode: string): Observable<{ groups?: any[] }> {
    return this.http.get<{ groups?: any[] }>(`${this.baseUrl}/groups_by_class/`, { params: { class_code: classCode } });
  }

  /** Distinct class levels from cheradip_subject for a country. useHsc: true → query HSC DB (Teacher add-subject). */
  getClassesByCountry(countryCode: string, options?: { useHsc?: boolean }): Observable<{ classes: Array<{ value: string; label: string; has_groups?: boolean }>; country_code: string }> {
    const params: { country_code: string; database?: string } = { country_code: countryCode || '' };
    if (options?.useHsc) params.database = 'hsc';
    return this.http.get<{ classes: Array<{ value: string; label: string; has_groups?: boolean }>; country_code: string }>(
      `${this.baseUrl}/classes_by_country/`,
      { params }
    );
  }

  /** Unique levels/classes for a country from cheradip_subject (for signup Class and Level dropdowns). */
  getLevelsByCountry(countryCode: string): Observable<{ levels: Array<{ level: string; level_tr: string; label: string }>; country_code: string }> {
    return this.http.get<{ levels: Array<{ level: string; level_tr: string; label: string }>; country_code: string }>(
      `${this.baseUrl}/levels_by_country/`,
      { params: { country_code: countryCode || '' } }
    );
  }

  /** Subjects for Teacher signup by country + level (from cheradip_subject). */
  getSubjectsByCountryLevel(countryCode: string, level: string): Observable<{ subjects: any[] }> {
    return this.http.get<{ subjects: any[] }>(
      `${this.baseUrl}/subjects_by_country_level/`,
      { params: { country_code: countryCode || '', level: level || '' } }
    );
  }

  /** Subjects for Degree / Honours / Masters (class 13-16) by country. */
  getSubjectsForDegree(countryCode: string): Observable<{ subjects: any[] }> {
    return this.http.get<{ subjects: any[] }>(
      `${this.baseUrl}/subjects_for_degree/`,
      { params: { country_code: countryCode || '' } }
    );
  }

  /** Submit a new subject request. Body: subject_name, subject_tr (or subject_translated), degree_type (optional), country_code (optional), level, level_tr, class_level (0-20 for non-University). */
  submitPendingSubjectRequest(body: { subject_name: string; subject_tr: string; subject_translated?: string; degree_type?: string; country_code?: string; level?: string; level_tr?: string; class_level?: number | string }): Observable<{ id: number; message: string }> {
    return this.http.post<{ id: number; message: string }>(`${this.baseUrl}/pending_subject_request/`, body);
  }

  /** Groups for Student signup by country + level (from cheradip_subject.groups). */
  getGroupsByCountryLevel(countryCode: string, level: string): Observable<{ groups: any[] }> {
    return this.http.get<{ groups: any[] }>(
      `${this.baseUrl}/groups_by_country_level/`,
      { params: { country_code: countryCode || '', level: level || '' } }
    );
  }

  signupWithData(formData: any): Observable<any> {
    const body: any = {
      acctype: formData.acctype,
      fullName: formData.fullName,
      username: formData.username,
      password: formData.password,
      division: formData.division || '',
      district: formData.district || '',
      thana: formData.thana || '',
      union: formData.union || '',
      village: formData.village || '',
      ...formData
    };
    // Only send group for Student; for Teacher/Job Seeker send empty (do not default to Science)
    body.group = formData.acctype === 'Student' ? (formData.group ?? '') : '';
    // Only send gender if user selected it (do not auto-send Male)
    if (formData.gender == null || formData.gender === '') {
      delete body.gender;
    }
    return this.http.post(`${this.baseUrl}/signup/`, body).pipe(
      tap((response: any) => {
        if (response && (response.token || response.authToken)) {
          const token = response.token || response.authToken;
          this.setToken(token);
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('authToken', token);
          if (response.username) localStorage.setItem('username', response.username);
          if (response.fullName) localStorage.setItem('fullName', response.fullName);
        }
      }),
      catchError((error) => { throw error; })
    );
  }

  sendPasswordResetCode(username: string, email?: string): Observable<any> {
    const body: { username: string; email?: string } = { username };
    if (email) body.email = email;
    return this.http.post(`${this.baseUrl}/send_password_reset_code/`, body);
  }

  verifyCode(username: string, code: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/verify_code/`, { username, code });
  }

  resetPasswordWithCode(username: string, code: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/reset_password_with_code/`, { username, code, newPassword });
  }

  // Question section: levels, subjects, chapters from cheradip_hsc
  /** Distinct levels (level_tr) from cheradip_subject in cheradip_hsc (for question page first dropdown). */
  getQuestionLevels(): Observable<{ levels: Array<{ level: string; level_tr: string; label: string }>; error?: string }> {
    return this.http.get<{ levels: Array<{ level: string; level_tr: string; label: string }>; error?: string }>(
      `${this.baseUrl}/question_levels/`
    );
  }
  /** Classes for a level from cheradip_hsc.cheradip_subject (query param level_tr). */
  getQuestionClasses(levelTr: string): Observable<{ classes: Array<{ value: string; label: string }>; error?: string }> {
    return this.http.get<{ classes: Array<{ value: string; label: string }>; error?: string }>(
      `${this.baseUrl}/question_classes/`,
      { params: { level_tr: levelTr || '' } }
    );
  }
  /** Groups for level (and optional class) from cheradip_subject.groups; empty if none. */
  getQuestionGroups(levelTr: string, classLevel?: string): Observable<{ groups: string[]; error?: string }> {
    const params: any = { level_tr: levelTr || '' };
    if (classLevel) params.class_level = classLevel;
    return this.http.get<{ groups: string[]; error?: string }>(`${this.baseUrl}/question_groups/`, { params });
  }
  /** Subjects for level (optional class_level and group filter). */
  getQuestionSubjects(params: { level_tr: string; class_level?: string; group?: string }): Observable<{ subjects: Array<{ level_tr: string; class_level: string; subject_tr: string; id: string; name: string }>; error?: string }> {
    const p: any = { level_tr: params.level_tr || '' };
    if (params.class_level) p.class_level = params.class_level;
    if (params.group) p.group = params.group;
    return this.http.get<{ subjects: Array<{ level_tr: string; class_level: string; subject_tr: string; id: string; name: string }>; error?: string }>(
      `${this.baseUrl}/question_subjects/`,
      { params: p }
    );
  }
  /** Unique chapters from subject question table; ordered by chapter_no ascending. */
  getQuestionChapters(params: { level_tr: string; class_level: string; subject_tr: string }): Observable<{ chapters: Array<{ id: string; name: string }>; error?: string }> {
    return this.http.get<{ chapters: Array<{ id: string; name: string }>; error?: string }>(
      `${this.baseUrl}/question_chapters/`,
      { params: { level_tr: params.level_tr || '', class_level: params.class_level || '', subject_tr: params.subject_tr || '' } }
    );
  }
  /** Unique topics from subject question table; optional chapter filter; ordered by topic ascending. */
  getQuestionTopics(params: { level_tr: string; class_level: string; subject_tr: string; chapter?: string }): Observable<{ topics: Array<{ id: string; name: string }>; error?: string }> {
    const p: any = { level_tr: params.level_tr || '', class_level: params.class_level || '', subject_tr: params.subject_tr || '' };
    if (params.chapter) p.chapter = params.chapter;
    return this.http.get<{ topics: Array<{ id: string; name: string }>; error?: string }>(
      `${this.baseUrl}/question_topics/`,
      { params: p }
    );
  }
  /** List questions from HSC subject table by topic (and optional chapter) for user to select. */
  getQuestionListByTopic(params: { level_tr: string; class_level: string; subject_tr: string; topic: string; chapter?: string }): Observable<{ questions: any[]; error?: string }> {
    const p: any = { level_tr: params.level_tr || '', class_level: params.class_level || '', subject_tr: params.subject_tr || '', topic: params.topic || '' };
    if (params.chapter) p.chapter = params.chapter;
    return this.http.get<{ questions: any[]; error?: string }>(`${this.baseUrl}/question_list/`, { params: p });
  }

  // Question CRUD
  getQuestionById(qid: number | string): Observable<any> {
    return this.http.get(`${this.baseUrl}/questions/${qid}/`);
  }

  createQuestion(question: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/questions/`, question);
  }

  updateQuestion(qid: number | string, question: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/questions/${qid}/`, question);
  }

  deleteQuestion(qid: number | string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/questions/${qid}/`);
  }

  /** Submit a new question for approval (pending). When approved, it is added with qid = chapter_no_topic_no_0001, ... */
  submitPendingQuestion(payload: {
    level_tr?: string; class_level?: string; subject_tr: string;
    chapter_no?: string; chapter: string; topic_no?: string; topic: string;
    question: string; option_1?: string; option_2?: string; option_3?: string; option_4?: string;
    answer?: string; explanation?: string; type?: string;
  }): Observable<{ id: number; status: string; message?: string }> {
    return this.http.post<{ id: number; status: string; message?: string }>(
      `${this.baseUrl}/pending_questions/submit/`,
      payload
    );
  }
}