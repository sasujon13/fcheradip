import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { cheradipChangeDetection } from './app/change-detection.config';

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule, { applicationProviders: [cheradipChangeDetection] })
  .catch(err => console.error(err));
