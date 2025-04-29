/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),           // 👈 AGREGA ESTO
    ...appConfig.providers         // 👈 Mantenemos lo que ya tienes
  ]
}).catch((err) => console.error(err));