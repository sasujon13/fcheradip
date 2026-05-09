/**
 * Dashboard landing: teachers → `/dashboard` (home dashboard), everyone else → `/student/dashboard`.
 * Prefer `localStorage.acctype` (set on login); fallback to `formData.acctype` (e.g. after signup).
 */
export function getAccountType(): string {
  let acctype = (localStorage.getItem('acctype') || '').trim();
  if (!acctype) {
    try {
      const raw = localStorage.getItem('formData');
      if (raw) {
        acctype = String(JSON.parse(raw)?.acctype || '').trim();
      }
    } catch {
      /* ignore */
    }
  }
  return acctype;
}

export function isTeacherAccount(): boolean {
  return getAccountType() === 'Teacher';
}

/** Default redirect target for voluntary login / manual signup (non–return-URL flows). */
export function getDefaultDashboardPath(): string {
  return isTeacherAccount() ? '/dashboard' : '/student/dashboard';
}

/** Segments for `[routerLink]` on the profile “Dashboard” item. */
export function getDashboardRouterLinkSegments(): string[] {
  return isTeacherAccount() ? ['dashboard'] : ['student', 'dashboard'];
}
