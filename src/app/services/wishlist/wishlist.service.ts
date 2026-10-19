import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, deleteDoc, doc, getDoc, orderBy, query, serverTimestamp, setDoc
} from '@angular/fire/firestore';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';
import { UsersService } from '../users/users.service';

export interface WishlistEntry {
  productId: string;
}

export type WishlistToggleResult = 'added' | 'removed' | 'login';

/**
 * Products a customer saved for later. Stored in the account (users/{uid}/wishlist/{productId}) so they follow
 * the customer across devices; the old per-browser list (localStorage "wishlist") is moved there on sign-in.
 */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private firestore = inject(Firestore);
  private usersService = inject(UsersService);

  private static readonly LEGACY_KEY = 'wishlist';

  /** The signed-in customer's favorites in real time, newest first; empty when signed out. */
  readonly entries$: Observable<WishlistEntry[]> = this.usersService.user$.pipe(
    switchMap(user => {
      if (!user) return of([] as WishlistEntry[]);
      const ref = collection(this.firestore, `users/${user.uid}/wishlist`);
      return collectionData(query(ref, orderBy('addedAt', 'desc')), { idField: 'productId' }).pipe(
        map(rows => rows.map(r => ({ productId: String(r['productId']) }))),
        catchError(() => of([] as WishlistEntry[]))
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  constructor() {
    // Favorites saved in this browser before they lived in the account join the account on the next sign-in
    this.usersService.user$.subscribe(user => {
      if (user) void this.migrateLegacyFavorites(user.uid);
    });
  }

  isFavorite$(productId: string): Observable<boolean> {
    return this.entries$.pipe(map(entries => entries.some(e => e.productId === productId)));
  }

  /** Adds or removes a product. Returns 'login' when nobody is signed in (favorites need an account). */
  async toggle(productId: string): Promise<WishlistToggleResult> {
    const user = this.usersService.getCurrentUser();
    if (!user) return 'login';
    const ref = doc(this.firestore, `users/${user.uid}/wishlist`, productId);
    if ((await getDoc(ref)).exists()) {
      await deleteDoc(ref);
      return 'removed';
    }
    await setDoc(ref, { productId, addedAt: serverTimestamp() });
    return 'added';
  }

  async remove(productId: string): Promise<void> {
    const user = this.usersService.getCurrentUser();
    if (!user) return;
    await deleteDoc(doc(this.firestore, `users/${user.uid}/wishlist`, productId));
  }

  private async migrateLegacyFavorites(uid: string): Promise<void> {
    try {
      const raw = localStorage.getItem(WishlistService.LEGACY_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(ids) || ids.length === 0) return;
      await Promise.all(ids.filter(id => typeof id === 'string' && id).map(id =>
        setDoc(doc(this.firestore, `users/${uid}/wishlist`, id), { productId: id, addedAt: serverTimestamp() }, { merge: true })
      ));
      localStorage.removeItem(WishlistService.LEGACY_KEY);
    } catch {
      /* keep the local list; it is retried on the next sign-in */
    }
  }
}
