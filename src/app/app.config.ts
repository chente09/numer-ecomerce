import { ApplicationConfig, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { icons } from './icons-provider';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { en_US, provideNzI18n } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import en from '@angular/common/locales/en';
import { FormsModule } from '@angular/forms';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getAnalytics, provideAnalytics, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { FirebaseInitService } from './services/firebase/firebase-init.service';
import { StockUpdateService } from './services/admin/stockUpdate/stock-update.service';

registerLocaleData(en);

// Firebase initialization factory
export function initializeFirebaseFactory(firebaseInitService: FirebaseInitService) {
  return () => firebaseInitService.initializeFirebase();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes, 
      withInMemoryScrolling({
        scrollPositionRestoration: 'top', // 🔧 ESTO FUERZA SCROLL AL TOP
        anchorScrolling: 'enabled'
      })
    ),
    provideNzIcons(icons), 
    provideNzI18n(en_US), 
    importProvidersFrom(FormsModule), 
    provideAnimationsAsync(), 
    provideHttpClient(), 
    StockUpdateService,
    provideFirebaseApp(() => initializeApp({ 
      projectId: "numer-16f35", 
      appId: "1:1010054110379:web:212389b0d3e9e17a896bee", 
      storageBucket: "numer-16f35.firebasestorage.app", 
      apiKey: "AIzaSyB4NSF26zLhm9qsXGrJZ6rNAUw2Z2T8k3o", 
      authDomain: "numer-16f35.firebaseapp.com", 
      messagingSenderId: "1010054110379", 
      measurementId: "G-GVGLYZ4RJJ" })), 
    provideAuth(() => getAuth()), 
    provideAnalytics(() => getAnalytics()), 
    ScreenTrackingService, 
    UserTrackingService, 
    provideFirestore(() => getFirestore()), 
    provideStorage(() => getStorage())
  ]
};
