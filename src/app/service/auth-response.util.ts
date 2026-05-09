/**
 * Normalize Django / DRF auth JSON (often snake_case) for the Angular client.
 */

export function resolveAuthTokenFromResponse(response: unknown): string {
  if (typeof response === 'string') {
    return response.trim();
  }
  if (!response || typeof response !== 'object') {
    return '';
  }
  const r = response as Record<string, unknown>;
  const candidates = [r['authToken'], r['auth_token'], r['token']];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
  }
  return '';
}

/** True when the API wants the welcome bonus coins ceremony (login / optional signup when API sets flag). */
export function resolveShowWelcomeCoinsCeremony(response: unknown): boolean {
  if (!response || typeof response !== 'object') {
    return false;
  }
  const r = response as Record<string, unknown>;
  return r['showWelcomeCoinsCeremony'] === true || r['show_welcome_coins_ceremony'] === true;
}

/**
 * After successful signup: show the same welcome ceremony as `/welcome` when the user is logged in,
 * unless the API explicitly sets `show_welcome_coins_ceremony` / `showWelcomeCoinsCeremony` to false.
 * Granting 5000 coins is done by the server; the client celebrates whenever we have a token.
 */
export function resolveShowWelcomeAfterSignup(response: unknown, token: string): boolean {
  if (!token.trim()) {
    return false;
  }
  if (!response || typeof response !== 'object') {
    return true;
  }
  const r = response as Record<string, unknown>;
  if (r['showWelcomeCoinsCeremony'] === false || r['show_welcome_coins_ceremony'] === false) {
    return false;
  }
  return true;
}
