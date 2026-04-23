// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
    production: false,
    // Relative URL: browser requests same origin (e.g. localhost:4200/api/countries/). Dev server proxies to Django. No CORS.
    // You must run the app with: ng serve (from fcheradip folder). Then open http://localhost:4200
    apiUrl: '/api',
    /**
     * Django dev server (media, /manage). Use this so <img> loads from :8000, not :4200 — ng serve often fails to
     * proxy /manage/media/* correctly (SPA fallback / proxy quirks). Production uses empty + same origin.
     */
    backendUrl: 'http://localhost:8000'
  };
  
  /*
   * For easier debugging in development mode, you can import the following file
   * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
   *
   * This import should be commented out in production mode because it will have a negative impact
   * on performance if an error is thrown.
   */
  // import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
  