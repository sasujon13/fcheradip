import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  // private djangoAdminUrl = 'http://127.0.0.1:8000/api/admin/';

  private baseUrl = 'http://127.0.0.1:8000/api';
  private djangoAdminUrl = 'http://127.0.0.1:8000/admin/';

  // private baseUrl = 'http://127.0.0.1:8000';
  userData: any;

  constructor(private http: HttpClient) { }


  getNotifications(): Observable<any> {
    const url = `${this.baseUrl}/notification/`;
    return this.http.get<string[]>(url);
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

  login(username: string, password: string): Observable<any> {
    const loginData = { username, password };
    return this.http.post(`${this.baseUrl}/login/`, loginData).pipe(
      tap((response: any) => {
        if (response) {
          this.setToken(response);
          localStorage.setItem('acctype', response.acctype);
          localStorage.setItem('fullName', response.fullName);
          localStorage.setItem('username', response.username);
          localStorage.setItem('division', response.division);
          localStorage.setItem('district', response.district);
          localStorage.setItem('thana', response.thana);
          localStorage.setItem('union', response.union);
          localStorage.setItem('village', response.village);
          localStorage.setItem('group', response.group);
          localStorage.setItem('gender', response.gender);
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('authToken', response);
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

  update(acctype: string, fullName: string, group: string, gender: string, division: string, district: string, thana: string, union: string, village: string, password: string): Observable<any> {
    const signupData = { acctype, fullName, group, gender, division, district, thana, union, village, password };
    return this.http.post(`${this.baseUrl}/profile_update/`, signupData).pipe(
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

  private setToken(token: string): void {
    localStorage.setItem('authToken', token);
  }

  getToken(): string | null {
    return localStorage.getItem('authToken');
  }

  checkMobileNumberExists(username: string): Observable<boolean> {
    const url = `${this.baseUrl}/username/?username=${username}`;
    return this.http.get<boolean>(url);
  }

  checkPasswordExists(username: string, password: string): Observable<boolean> {
    const url = `${this.baseUrl}/password/?username=${username}&password=${password}`;
    return this.http.get<boolean>(url);
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
          
}