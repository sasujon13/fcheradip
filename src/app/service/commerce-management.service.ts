import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { catchError, map, of, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CommerceAccess {
  allowed: boolean;
  authenticated?: boolean;
  superuser?: boolean;
  permissions: Record<string, Partial<Record<'view' | 'add' | 'change' | 'delete', boolean>>>;
}

@Injectable({ providedIn: 'root' })
export class CommerceManagementService {
  readonly url = `${environment.apiUrl}/ecommerce/admin`;
  constructor(public http: HttpClient) {}
  access() {
    return this.http.get<CommerceAccess>(`${this.url}/access/`).pipe(timeout(10000));
  }
}

@Injectable({ providedIn: 'root' })
export class CommerceManagementGuard implements CanActivate {
  constructor(private service: CommerceManagementService, private router: Router) {}
  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    // Never trust account type, cached role flags, or a manually entered URL.
    return this.service.access().pipe(
      map(access => access.allowed || (access.authenticated === false
        ? this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })
        : this.router.createUrlTree(['/ecommerce'], { queryParams: { manage: 'not-authorized' } }))),
      catchError(() => of(this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }))),
    );
  }
}
