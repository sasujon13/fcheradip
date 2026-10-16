import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { isTeacherAccount } from './dashboard-route.util';

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
