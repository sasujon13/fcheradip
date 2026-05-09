/**
 * When `'1'`: after login, prefer `returnUrl` / query `returnUrl` (guard, trx, deep flows).
 * Absent or other: voluntary login → `/dashboard`.
 */
export const SESSION_LOGIN_USE_STORED_RETURN = 'cheradipLoginUseStoredReturnUrl';
