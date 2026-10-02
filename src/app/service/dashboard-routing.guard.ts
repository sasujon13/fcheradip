import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { isTeacherAccount } from './dashboard-route.util';
import { ApiService } from './api.service';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/** `/dashboard` (home): teachers only; others go to `/student/dashboard`. */
@Injectable({ providedIn: 'root' })
export class TeacherHomeDashboardGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(): boolean | UrlTree {
    if (isTeacherAccount()) {
      return true;
    }
    return this.router.parseUrl('/student/dashboard');
  }
}

/** `/student/dashboard`: non-teachers only; teachers go to `/dashboard`. */
@Injectable({ providedIn: 'root' })
export class StudentSectionDashboardGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(): boolean | UrlTree {
    if (!isTeacherAccount()) {
      return true;
    }
    return this.router.parseUrl('/dashboard');
  }
}

/** Paid students study existing questions and cannot enter the authoring tool. */
@Injectable({ providedIn: 'root' })
export class StudentQuestionCreatorGuard implements CanActivate {
  constructor(private router: Router, private api: ApiService) {}

  canActivate(): boolean | UrlTree | Observable<boolean | UrlTree> {
    if (!this.api.isLoggedIn()) return true;
    return this.api.getPackageStatus().pipe(
      map((value) => value?.active && value?.progress?.accountType === 'Student'
        ? this.router.parseUrl('/question') : true),
      catchError(() => of(true)),
    );
  }
}
