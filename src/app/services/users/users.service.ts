// src/app/services/users/users.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  deleteUser as firebaseDeleteUser, // Renombrar para evitar conflicto con el método del servicio
  authState,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
  sendEmailVerification,
  sendPasswordResetEmail,
  User // Importar User de @angular/fire/auth
} from '@angular/fire/auth';
import { Firestore, query, where, FieldValue } from '@angular/fire/firestore'; // Importar FieldValue
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  Timestamp,
  updateDoc
} from '@angular/fire/firestore';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface LoginInfo {
  email: string;
  password: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  // FIX: Usar FieldValue para la escritura y Timestamp|Date para la lectura (la conversión se encarga)
  createdAt: Timestamp | Date | FieldValue; 
  lastLogin: Timestamp | Date | FieldValue;  
  roles: string[]; // 'admin', 'customer', 'distributor'
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthDate?: Timestamp | Date | FieldValue; 
  documentType?: string;
  documentNumber?: string;
  profileCompleted?: boolean;
  defaultAddress?: any; // Considerar definir una interfaz para Address
  updatedAt?: Timestamp | Date | FieldValue; 
}


@Injectable({
  providedIn: 'root'
})
export class UsersService {
  user$: Observable<User | null>;

  private firestore = inject(Firestore);

  constructor(private auth: Auth) {
    this.user$ = authState(this.auth);
    this.user$.subscribe(user => {
      if (user && !user.isAnonymous) {
        this.saveUserData(user);
      }
    });
  }

  private async saveUserData(user: User): Promise<void> {
    try {
      if (user.isAnonymous) {
        return;
      }

      const userRef = doc(this.firestore, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          emailVerified: user.emailVerified,
          isAnonymous: false,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          roles: ['customer']
        });
      } else {
        await setDoc(userRef, {
          lastLogin: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error guardando datos de usuario:', error);
    }
  }

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

  setSessionPersistence(): Promise<void> {
    return setPersistence(this.auth, browserSessionPersistence);
  }

  setLocalPersistence(): Promise<void> {
    return setPersistence(this.auth, browserLocalPersistence);
  }

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

  resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  async getUserRoles(): Promise<string[]> {
    const user = this.auth.currentUser;
    if (!user || user.isAnonymous) {
      return [];
    }
    try {
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

  getUsers(role?: string): Observable<UserProfile[]> {
    const usersRef = collection(this.firestore, 'users');
    let q = query(usersRef);

    if (role) {
      q = query(usersRef, where('roles', 'array-contains', role));
    }

    return from(getDocs(q)).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return this.convertTimestampsToDates({ id: doc.id, ...data }) as UserProfile;
        });
      }),
      catchError(error => {
        console.error('Error obteniendo usuarios:', error);
        return of([]);
      })
    );
  }

  async updateUserRoles(uid: string, newRoles: string[]): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser || !(await this.hasRole('admin'))) {
      throw new Error('Acceso denegado: Solo los administradores pueden modificar roles.');
    }

    try {
      const userRef = doc(this.firestore, 'users', uid);
      await updateDoc(userRef, {
        roles: newRoles,
        updatedAt: serverTimestamp()
      });
      console.log(`✅ Roles de usuario ${uid} actualizados a: ${newRoles.join(', ')}`);
    } catch (error) {
      console.error(`❌ Error actualizando roles para ${uid}:`, error);
      throw error;
    }
  }

  async deleteRegister(uid: string): Promise<void> {
    const currentUser = this.auth.currentUser;

    if (!currentUser) {
      throw new Error('No hay usuario autenticado para realizar esta operación.');
    }

    const isAdmin = await this.hasRole('admin');

    if (currentUser.uid === uid) {
      try {
        await firebaseDeleteUser(currentUser);
        await deleteDoc(doc(this.firestore, 'users', uid));
        console.log(`✅ Usuario ${uid} eliminado (auto-eliminación).`);
      } catch (error: any) {
        if (error.code === 'auth/requires-recent-login') {
          throw new Error('Por favor, vuelve a iniciar sesión para eliminar tu cuenta.');
        }
        console.error(`❌ Error al auto-eliminar usuario ${uid}:`, error);
        throw error;
      }
    } else if (isAdmin) {
      try {
        await deleteDoc(doc(this.firestore, 'users', uid));
        console.log(`✅ Documento de usuario ${uid} eliminado por admin. (Cuenta de Auth debe eliminarse manualmente).`);
      } catch (error) {
        console.error(`❌ Error al eliminar documento de usuario ${uid} por admin:`, error);
        throw error;
      }
    } else {
      throw new Error('No autorizado para eliminar este usuario.');
    }
  }


  async canAccessRoute(route: string): Promise<boolean> {
    const routePermissions: { [key: string]: string[] } = {
      '/admin': ['admin'],
      '/procesos': ['admin', 'editor'],
      '/admin/distributors': ['admin'],
      '/admin/users': ['admin']
    };

    if (!routePermissions[route]) return true;

    const roles = await this.getUserRoles();
    return routePermissions[route].some(role => roles.includes(role));
  }

  async logUserActivity(action: string, resource: string, details?: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || user.isAnonymous) {
      return;
    }
    try {
      const logData = {
        userId: user.uid,
        email: user.email,
        action,
        resource,
        details: details === undefined ? null : details,
        timestamp: serverTimestamp()
      };
      const logCollection = collection(this.firestore, 'user_activity_logs');
      await addDoc(logCollection, logData);
    } catch (error) {
      console.warn('Error registrando actividad:', error);
    }
  }

  async saveUserProfile(userData: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No hay usuario autenticado');
    try {
      const userRef = doc(this.firestore, 'users', user.uid);
      const dataToSave = {
        ...userData,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp() // Siempre usar serverTimestamp para createdAt si no existe
      };
      await setDoc(userRef, dataToSave, { merge: true });
      await this.logUserActivity('update_profile', 'user_data');
    } catch (error) {
      console.error('Error guardando perfil:', error);
      throw error;
    }
  }

  async getUserProfile(uid?: string): Promise<UserProfile | null> {
    const targetUid = uid || this.auth.currentUser?.uid;
    if (!targetUid) return null;
    try {
      const userRef = doc(this.firestore, 'users', targetUid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        return this.convertTimestampsToDates({ id: userSnap.id, ...data }) as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
      throw error;
    }
  }

  // 🆕 MÉTODO: Convertir Timestamps de Firebase a objetos Date (AHORA PÚBLICO)
  // ✅ CORRECCIÓN: Asegurar que el método es público
  public convertTimestampsToDates(data: any): any {
    const converted = { ...data };
    const timestampFields = ['birthDate', 'createdAt', 'updatedAt', 'lastLogin'];
    timestampFields.forEach(field => {
      if (converted[field]) {
        try {
          if (converted[field] instanceof Timestamp) {
            converted[field] = converted[field].toDate();
          } else if (typeof converted[field] === 'object' && converted[field].seconds !== undefined && converted[field].nanoseconds !== undefined) { 
            // Esto maneja objetos { seconds: ..., nanoseconds: ... } que no son instancias de Timestamp
            converted[field] = new Date(converted[field].seconds * 1000 + converted[field].nanoseconds / 1000000); 
          } else if (typeof converted[field] === 'string') {
            converted[field] = new Date(converted[field]);
          } else if (typeof converted[field] === 'object' && converted[field] !== null && (converted[field] as any)._methodName) { 
            // Si es un FieldValue (como deleteField() o serverTimestamp() sin resolver)
            converted[field] = null;
          }
          // Si es un FieldValue de serverTimestamp(), se espera que ya se haya resuelto a Timestamp
          // al ser leído de Firestore. Si no, significa un problema de sincronización o lectura.
          // Por lo tanto, si llega como FieldValue y no es un Timestamp, no lo convertimos.
          // El HTML debe manejar el caso de que sea null.

        } catch (error) {
          console.warn(`Error convirtiendo timestamp del campo ${field}:`, error);
          converted[field] = null;
        }
      }
    });
    return converted;
  }


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
      const hasCompleteAddress = userData?.defaultAddress?.address &&
        userData?.defaultAddress?.city &&
        userData?.defaultAddress?.province &&
        userData?.defaultAddress?.canton;
      if (hasCompleteAddress) return true;
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

  async isProfileCompleteForCheckout(): Promise<{
    complete: boolean;
    missingFields: string[];
    missingAddress: boolean;
  }> {
    try {
      const userData = await this.getUserProfile();
      const missingFields: string[] = [];
      let missingAddress = false;
      if (!userData?.firstName) missingFields.push('Nombre');
      if (!userData?.lastName) missingFields.push('Apellido');
      if (!userData?.phone) missingFields.push('Teléfono');
      if (!userData?.birthDate) missingFields.push('Fecha de nacimiento');
      if (!userData?.documentType) missingFields.push('Tipo de documento');
      if (!userData?.documentNumber) missingFields.push('Número de documento');
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
      const addressesRef = collection(this.firestore, `users/${user.uid}/addresses`);
      await addDoc(addressesRef, {
        ...addressData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
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
      const addressRef = doc(this.firestore, `users/${user.uid}/addresses`, addressId);
      await setDoc(addressRef, {
        ...addressData,
        updatedAt: serverTimestamp()
      }, { merge: true });
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
      const addressRef = doc(this.firestore, `users/${user.uid}/addresses`, addressId);
      await deleteDoc(addressRef);
      console.log('✅ Dirección eliminada exitosamente');
    } catch (error) {
      console.error('❌ Error eliminando dirección:', error);
      throw error;
    }
  }

  async saveNewsletterSubscription(subscriptionData: {
    email: string;
    subscribedAt: Date;
    source: string;
    isActive: boolean;
    userId?: string | null;
  }): Promise<void> {
    try {
      const subscriptionsRef = collection(this.firestore, 'newsletter_subscriptions');
      const existingQuery = query(
        subscriptionsRef,
        where('email', '==', subscriptionData.email)
      );
      const existingSnap = await getDocs(existingQuery);
      if (!existingSnap.empty) {
        const docRef = existingSnap.docs[0].ref;
        await setDoc(docRef, {
          ...subscriptionData,
          updatedAt: serverTimestamp(),
          resubscribedAt: serverTimestamp(),
          resubscribeCount: (existingSnap.docs[0].data()['resubscribeCount'] || 0) + 1
        }, { merge: true });
        console.log('✅ Suscripción al newsletter actualizada');
      } else {
        await addDoc(subscriptionsRef, {
          ...subscriptionData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          resubscribeCount: 0
        });
        console.log('✅ Nueva suscripción al newsletter creada');
      }
      if (subscriptionData.userId) {
        await this.logUserActivity('newsletter_subscription', 'newsletter', {
          email: subscriptionData.email,
          source: subscriptionData.source
        });
      }
    } catch (error) {
      console.error('❌ Error guardando suscripción al newsletter:', error);
      throw new Error(`Error al suscribirse al newsletter: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  async isEmailSubscribedToNewsletter(email: string): Promise<boolean> {
    try {
      const subscriptionsRef = collection(this.firestore, 'newsletter_subscriptions');
      const q = query(
        subscriptionsRef,
        where('email', '==', email.toLowerCase().trim()),
        where('isActive', '==', true)
      );
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error verificando suscripción:', error);
      return false;
    }
  }

  async unsubscribeFromNewsletter(email: string): Promise<void> {
    try {
      const subscriptionsRef = collection(this.firestore, 'newsletter_subscriptions');
      const q = query(subscriptionsRef, where('email', '==', email.toLowerCase().trim()));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        await setDoc(docRef, {
          isActive: false,
          unsubscribedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        const user = this.getCurrentUser();
        if (user) {
          await this.logUserActivity('newsletter_unsubscription', 'newsletter', { email });
        }
        console.log('✅ Usuario desuscrito del newsletter');
      }
    } catch (error) {
      console.error('❌ Error al desuscribirse del newsletter:', error);
      throw error;
    }
  }
}
