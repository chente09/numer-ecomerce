import { Injectable } from '@angular/core';
import { 
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
  deleteUser,
  authState,
  setPersistence, 
  browserSessionPersistence, 
  browserLocalPersistence,
  sendEmailVerification,
  sendPasswordResetEmail
} from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { addDoc, collection, doc, getDoc, getFirestore, setDoc } from '@angular/fire/firestore';
import { getFunctions, httpsCallable } from '@angular/fire/functions';

export interface LoginInfo {
  email: string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  // Observable para el estado de autenticación
  user$: Observable<User | null>;

  constructor(private auth: Auth) {
    this.user$ = authState(this.auth);
    // Suscribirse a cambios de usuario para guardar información
    this.user$.subscribe(user => {
      if (user) {
        this.saveUserData(user);
      }
    });
  }

   // Método para guardar datos del usuario en Firestore
  private async saveUserData(user: User): Promise<void> {
    try {
      const db = getFirestore();
      const userRef = doc(db, 'users', user.uid);
      
      // Verificar si el usuario ya existe
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        // Crear un nuevo registro si no existe
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          emailVerified: user.emailVerified,
          createdAt: new Date(),
          lastLogin: new Date(),
          roles: ['customer'] // Rol por defecto
        });
      } else {
        // Actualizar solo el último login
        await setDoc(userRef, {
          lastLogin: new Date()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error guardando datos de usuario:', error);
    }
  }

  // Métodos de registro y autenticación
  register({email, password}: LoginInfo): Promise<any> {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  login({email, password}: LoginInfo): Promise<any> {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  async loginWithGoogle(): Promise<any> {
    const result = await signInWithPopup(this.auth, new GoogleAuthProvider());
    // No necesitamos llamar a saveUserData aquí porque se dispara automáticamente con la suscripción
    return result;
  }   

  logout(): Promise<void> { 
    return signOut(this.auth);
  }

  // Gestión de persistencia
  setSessionPersistence(): Promise<void> {
    return setPersistence(this.auth, browserSessionPersistence);
  }

  setLocalPersistence(): Promise<void> {
    return setPersistence(this.auth, browserLocalPersistence);
  }

  // Información de usuario
  getCurrentUser(): User | null {
    return this.auth.currentUser;
  }

  async getIdToken(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (user) {
      return user.getIdToken();
    }
    return null;
  }

  // Verificación de email
  sendVerificationEmail(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) {
      return sendEmailVerification(user);
    }
    return Promise.reject('No hay usuario autenticado');
  }

  isEmailVerified(): boolean {
    return this.auth.currentUser?.emailVerified || false;
  }

  // Restablecimiento de contraseña
  resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  // Gestión de roles y permisos
  async getUserRoles(): Promise<string[]> {
    const user = this.auth.currentUser;
    if (!user) return [];
    
    try {
      const db = getFirestore();
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      return userDoc.exists() ? userDoc.data()?.['roles'] || [] : [];
    } catch (error) {
      console.error('Error obteniendo roles:', error);
      return [];
    }
  }

  async hasRole(role: string): Promise<boolean> {
    const roles = await this.getUserRoles();
    return roles.includes(role);
  }

  // Eliminación de usuarios
  async deleteRegister(uid: string): Promise<any> {
    const currentUser = this.auth.currentUser;
    
    // Solo permite eliminar si es el mismo usuario o es un admin
    if (currentUser?.uid === uid || await this.hasRole('admin')) {
      if (currentUser?.uid === uid) {
        // Si es el propio usuario
        return deleteUser(currentUser);
      } else {
        // Si es admin eliminando a otro usuario, utiliza una Cloud Function
        // Esta función debe estar implementada en Firebase Functions
        const functions = getFunctions();
        const deleteUserFunc = httpsCallable(functions, 'deleteUser');
        await deleteUserFunc({ uid });
        return Promise.resolve();
      }
    }
    
    return Promise.reject('No autorizado para eliminar este usuario');
  }

  // Método para verificar si el usuario tiene acceso a una ruta específica
  async canAccessRoute(route: string): Promise<boolean> {
    // Implementa lógica basada en roles para verificar acceso
    // Ejemplo simple:
    const routePermissions: {[key: string]: string[]} = {
      '/admin': ['admin'],
      '/procesos': ['admin', 'editor'],
      // Añade otras rutas según sea necesario
    };

    if (!routePermissions[route]) return true; // Si no hay restricciones específicas
    
    const roles = await this.getUserRoles();
    return routePermissions[route].some(role => roles.includes(role));
  }

  // Método para registrar actividad de usuario (para auditoría)
  async logUserActivity(action: string, resource: string, details?: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      const db = getFirestore();
      const logData = {
        userId: user.uid,
        email: user.email,
        action,
        resource,
        details,
        timestamp: new Date()
      };
      
      // Añadir a una colección de logs
      const logCollection = collection(db, 'user_activity_logs');
      await addDoc(logCollection, logData);
    } catch (error) {
      console.error('Error registrando actividad:', error);
    }
  }
}