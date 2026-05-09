export const environment = {
    production: true,
    /**
     * Same-origin API path. Do not use https://cheradip.com/api here: users on
     * https://www.cheradip.com would call the apex host (cross-origin → CORS/cookies break).
     * Nginx must proxy /api/ to Gunicorn for both cheradip.com and www.cheradip.com.
     */
    apiUrl: '/api',
    /** Set full backend origin only if static assets or media are loaded from another host. */
    backendUrl: ''
  };
  