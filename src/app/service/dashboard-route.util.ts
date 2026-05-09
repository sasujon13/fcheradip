/**
 * Dashboard landing: teachers → `/dashboard` (home dashboard), everyone else → `/student/dashboard`.
 * Prefer `formData.acctype` when set (signup / profile save); else `localStorage.acctype` (login API).
 * Login stores minimal `formData` without `acctype`, so the key from `/login/` is used; signup only
 * persisted `acctype` inside `formData` until we also sync the top-level key — stale keys misrouted teachers.
 */
export function getAccountType(): string {
  let fromForm = '';
  try {
    const raw = localStorage.getItem('formData');
    if (raw) {
      fromForm = String(JSON.parse(raw)?.acctype || '').trim();
    }
  } catch {
    /* ignore */
  }
  const fromKey = (localStorage.getItem('acctype') || '').trim();
  return fromForm || fromKey;
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
