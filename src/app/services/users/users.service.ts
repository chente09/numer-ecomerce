import { Injectable, inject } from '@angular/core';
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
import { Firestore } from '@angular/fire/firestore';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  Timestamp
} from '@angular/fire/firestore';
import { getFunctions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';

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

  // ✅ CORRECCIÓN: Inyectar Firestore correctamente
  private firestore = inject(Firestore);

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
      // ✅ USAR: this.firestore
      const userRef = doc(this.firestore, 'users', user.uid);

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
          createdAt: serverTimestamp(), // ✅ USAR serverTimestamp
          lastLogin: serverTimestamp(),
          roles: ['customer'] // Rol por defecto
        });
      } else {
        // Actualizar solo el último login
        await setDoc(userRef, {
          lastLogin: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error guardando datos de usuario:', error);
    }
  }

  // Métodos de registro y autenticación
  register({ email, password }: LoginInfo): Promise<any> {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  login({ email, password }: LoginInfo): Promise<any> {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  async loginWithGoogle(): Promise<any> {
    const result = await signInWithPopup(this.auth, new GoogleAuthProvider());
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
      // ✅ USAR: this.firestore
      const userDoc = await getDoc(doc(this.firestore, 'users', user.uid));
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
    const routePermissions: { [key: string]: string[] } = {
      '/admin': ['admin'],
      '/procesos': ['admin', 'editor'],
    };

    if (!routePermissions[route]) return true;

    const roles = await this.getUserRoles();
    return routePermissions[route].some(role => roles.includes(role));
  }

  // ✅ CORRECCIÓN: Método para registrar actividad usando user_activity_logs
  async logUserActivity(action: string, resource: string, details?: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      // ✅ USAR: this.firestore y user_activity_logs
      const logData = {
        userId: user.uid, // ✅ IMPORTANTE: Para que coincida con tus reglas
        email: user.email,
        action,
        resource,
        details: details === undefined ? null : details,
        timestamp: serverTimestamp()
      };

      const logCollection = collection(this.firestore, 'user_activity_logs');
      await addDoc(logCollection, logData);
    } catch (error) {
      // ✅ Solo warning, no interrumpir flujo
      console.warn('Error registrando actividad:', error);
    }
  }

  // Guardar perfil de usuario
  async saveUserProfile(userData: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No hay usuario autenticado');

    try {
      // ✅ USAR: this.firestore
      const userRef = doc(this.firestore, 'users', user.uid);

      // ✅ CORRECCIÓN: Procesar fechas correctamente
      const dataToSave = {
        ...userData,
        updatedAt: serverTimestamp(),
        createdAt: userData.createdAt || serverTimestamp()
      };

      // Actualizar datos de usuario
      await setDoc(userRef, dataToSave, { merge: true });

      // Registrar actividad
      await this.logUserActivity('update_profile', 'user_data');
    } catch (error) {
      console.error('Error guardando perfil:', error);
      throw error;
    }
  }

  // ✅ CORRECCIÓN: Obtener datos completos del perfil con conversión de timestamps
  async getUserProfile(): Promise<any> {
    const user = this.auth.currentUser;
    if (!user) return null;

    try {
      // ✅ USAR: this.firestore
      const userRef = doc(this.firestore, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();

        // ✅ CORRECCIÓN: Convertir timestamps automáticamente
        return this.convertFirebaseTimestamps(data);
      }
      return null;
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
      throw error;
    }
  }

  // ✅ NUEVO: Método para convertir timestamps de Firebase
  private convertFirebaseTimestamps(data: any): any {
    const converted = { ...data };

    // Lista de campos que pueden ser timestamps
    const timestampFields = ['birthDate', 'createdAt', 'updatedAt', 'lastLogin'];

    timestampFields.forEach(field => {
      if (converted[field]) {
        try {
          if (converted[field] instanceof Timestamp) {
            converted[field] = converted[field].toDate();
          } else if (converted[field].seconds !== undefined) {
            converted[field] = new Date(converted[field].seconds * 1000);
          } else if (typeof converted[field] === 'string') {
            converted[field] = new Date(converted[field]);
          }
        } catch (error) {
          console.warn(`Error convirtiendo timestamp del campo ${field}:`, error);
          converted[field] = null;
        }
      }
    });

    return converted;
  }

  // Verificar si el perfil está completo
  async isProfileComplete(): Promise<boolean> {
    try {
      const userData = await this.getUserProfile();

      const basicFieldsComplete = userData?.firstName &&
        userData?.lastName &&
        userData?.phone &&
        userData?.birthDate &&
        userData?.documentType &&
        userData?.documentNumber &&
        userData?.profileCompleted === true;

      if (!basicFieldsComplete) return false;

      // Verificar dirección completa
      const hasCompleteAddress = userData?.defaultAddress?.address &&
        userData?.defaultAddress?.city &&
        userData?.defaultAddress?.province &&
        userData?.defaultAddress?.canton;

      if (hasCompleteAddress) return true;

      // Verificar en subcolección de direcciones
      const addresses = await this.getUserAddresses();
      const hasValidAddress = addresses.some(addr =>
        addr['address'] && addr['city'] && addr['province'] && addr['canton']
      );

      return hasValidAddress;

    } catch (error) {
      console.error('Error verificando perfil:', error);
      return false;
    }
  }

  // Método específico para checkout
  async isProfileCompleteForCheckout(): Promise<{
    complete: boolean;
    missingFields: string[];
    missingAddress: boolean;
  }> {
    try {
      const userData = await this.getUserProfile();
      const missingFields: string[] = [];
      let missingAddress = false;

      // Verificar campos básicos del perfil
      if (!userData?.firstName) missingFields.push('Nombre');
      if (!userData?.lastName) missingFields.push('Apellido');
      if (!userData?.phone) missingFields.push('Teléfono');
      if (!userData?.birthDate) missingFields.push('Fecha de nacimiento');
      if (!userData?.documentType) missingFields.push('Tipo de documento');
      if (!userData?.documentNumber) missingFields.push('Número de documento');

      // Verificar dirección de envío
      let hasValidAddress = false;

      if (userData?.defaultAddress) {
        hasValidAddress = !!(
          userData.defaultAddress.address &&
          userData.defaultAddress.city &&
          userData.defaultAddress.province &&
          userData.defaultAddress.canton
        );
      }

      if (!hasValidAddress) {
        const addresses = await this.getUserAddresses();
        hasValidAddress = addresses.some(addr =>
          addr.address && addr.city && addr.province && addr.canton
        );
      }

      if (!hasValidAddress) {
        missingAddress = true;
      }

      return {
        complete: missingFields.length === 0 && !missingAddress,
        missingFields,
        missingAddress
      };

    } catch (error) {
      console.error('Error verificando perfil para checkout:', error);
      return {
        complete: false,
        missingFields: ['Error al verificar perfil'],
        missingAddress: true
      };
    }
  }

  async saveUserAddress(addressData: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No hay usuario autenticado');

    try {
      // ✅ USAR: this.firestore
      const addressesRef = collection(this.firestore, `users/${user.uid}/addresses`);

      await addDoc(addressesRef, {
        ...addressData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Si es la primera dirección, también guardarla en el perfil principal
      if (addressData.isDefault) {
        const userRef = doc(this.firestore, 'users', user.uid);
        await setDoc(userRef, {
          defaultAddress: addressData,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      console.log('✅ Dirección guardada exitosamente');
    } catch (error) {
      console.error('❌ Error guardando dirección:', error);
      throw error;
    }
  }

  async updateUserAddress(addressId: string, addressData: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No hay usuario autenticado');

    try {
      // ✅ USAR: this.firestore
      const addressRef = doc(this.firestore, `users/${user.uid}/addresses`, addressId);

      await setDoc(addressRef, {
        ...addressData,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Si es la dirección por defecto, actualizar en el perfil principal
      if (addressData.isDefault) {
        const userRef = doc(this.firestore, 'users', user.uid);
        await setDoc(userRef, {
          defaultAddress: addressData,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      console.log('✅ Dirección actualizada exitosamente');
    } catch (error) {
      console.error('❌ Error actualizando dirección:', error);
      throw error;
    }
  }

  async getUserAddresses(): Promise<any[]> {
    const user = this.auth.currentUser;
    if (!user) return [];

    try {
      // ✅ USAR: this.firestore
      const addressesRef = collection(this.firestore, `users/${user.uid}/addresses`);
      const snapshot = await getDocs(addressesRef);

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error obteniendo direcciones:', error);
      return [];
    }
  }

  async deleteUserAddress(addressId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No hay usuario autenticado');

    try {
      // ✅ USAR: this.firestore
      const addressRef = doc(this.firestore, `users/${user.uid}/addresses`, addressId);
      await deleteDoc(addressRef);

      console.log('✅ Dirección eliminada exitosamente');
    } catch (error) {
      console.error('❌ Error eliminando dirección:', error);
      throw error;
    }
  }
}