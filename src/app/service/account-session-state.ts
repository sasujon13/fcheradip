/** Identity for in-flight account reads; never log or display this value. */
export function accountSessionKey(): string {
  const token = (localStorage.getItem('authToken') || '').trim();
  return token && localStorage.getItem('isLoggedIn') === 'true'
    ? JSON.stringify([localStorage.getItem('username') || '', token]) : '';
}
