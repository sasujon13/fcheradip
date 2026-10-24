import { provideZoneChangeDetection } from '@angular/core';

// This NgModule application uses ordinary fields in HTTP/timer subscriptions.
// Angular 21 defaults to zoneless even with zone.js loaded; keep the existing
// refresh contract until those components have explicitly migrated to signals.
export const cheradipChangeDetection = provideZoneChangeDetection();
