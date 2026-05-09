import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SESSION_LOGIN_USE_STORED_RETURN } from './login-redirect.session';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (localStorage.getItem('authToken')) {
      return true;
    } else {
      localStorage.setItem('returnUrl', state.url);
      sessionStorage.setItem(SESSION_LOGIN_USE_STORED_RETURN, '1');
      this.router.navigate(['/login']);
      return false;
    }
  }
}
