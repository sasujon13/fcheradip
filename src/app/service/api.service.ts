import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, tap } from 'rxjs/operators';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private baseUrl = environment.apiUrl;
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

  getRDistricts(): Observable<string[]> {
    const url = `${this.baseUrl}/recommend/unique_districts/`;
    return this.http.get<string[]>(url);
  }

  getRThanas(district: string): Observable<string[]> {
    const url = `${this.baseUrl}/recommend/unique_thanas/?district=${district}`;
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
    countryCode?: string
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

  /** Unique levels/classes for a country from cheradip_subject (for signup Class and Level dropdowns). */
  getLevelsByCountry(countryCode: string): Observable<{ levels: string[]; country_code: string }> {
    return this.http.get<{ levels: string[]; country_code: string }>(
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

  /** Groups for Student signup by country + level (from cheradip_subject.groups). */
  getGroupsByCountryLevel(countryCode: string, level: string): Observable<{ groups: any[] }> {
    return this.http.get<{ groups: any[] }>(
      `${this.baseUrl}/groups_by_country_level/`,
      { params: { country_code: countryCode || '', level: level || '' } }
    );
  }

  signupWithData(formData: any): Observable<any> {
    const body = {
      acctype: formData.acctype,
      fullName: formData.fullName,
      username: formData.username,
      password: formData.password,
      group: formData.group || '',
      gender: formData.gender || 'Male',
      division: formData.division || '',
      district: formData.district || '',
      thana: formData.thana || '',
      union: formData.union || '',
      village: formData.village || '',
      ...formData
    };
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

  // Question-related methods
  getQuestionById(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/questions/${id}/`);
  }

  createQuestion(question: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/questions/`, question);
  }

  updateQuestion(id: number, question: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/questions/${id}/`, question);
  }

  deleteQuestion(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/questions/${id}/`);
  }
}