import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FirebaseApp, initializeApp } from '@angular/fire/app';

interface FirebaseConfig {
  projectId: string;
  appId: string;
  storageBucket: string;
  apiKey: string;
  authDomain: string;
  messagingSenderId: string;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseInitService {

  private firebaseApp: FirebaseApp | null = null;
  
  constructor(private http: HttpClient) {}
  
  async initializeFirebase(): Promise<FirebaseApp> {
    if (this.firebaseApp) {
      return this.firebaseApp;
    }
    
    try {
      // Get Firebase configuration from serverless function
      const response = await firstValueFrom(
        this.http.get<{ firebaseConfig: FirebaseConfig }>('/.netlify/functions/firebase-config')
      );
      
      const firebaseConfig = response.firebaseConfig;
      this.firebaseApp = initializeApp(firebaseConfig);
      return this.firebaseApp;
    } catch (error) {
      console.error('Failed to initialize Firebase:', error);
      throw error;
    }
  }
  
  getFirebaseApp(): FirebaseApp | null {
    return this.firebaseApp;
  }
}
