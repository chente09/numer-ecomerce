import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MonoTypeOperatorFunction, firstValueFrom } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UsersService } from '../users/users.service';

const REQUEST_REBUILD_URL = 'https://backend-numer.netlify.app/.netlify/functions/request-rebuild';

export type RebuildReason = 'product' | 'promotion' | 'category' | 'technology';

/**
 * The static pages that search engines read are generated when the storefront is built. After the admin changes
 * the catalog, this tells the backend so it can rebuild once things are quiet. Best effort: a failure here never
 * blocks or breaks the admin's save.
 */
@Injectable({ providedIn: 'root' })
export class SiteRebuildService {
  private http = inject(HttpClient);
  private usersService = inject(UsersService);
  private lastSent = new Map<RebuildReason, number>();

  /** Fire and forget. The backend collapses several notices into one build, so a burst is sent at most once. */
  notify(reason: RebuildReason): void {
    const now = Date.now();
    if (now - (this.lastSent.get(reason) ?? 0) < 5000) return;
    this.lastSent.set(reason, now);
    void this.send(reason);
  }

  /** For service methods that return an Observable: notifies once the save completed without error. */
  after<T>(reason: RebuildReason): MonoTypeOperatorFunction<T> {
    return tap<T>({ complete: () => this.notify(reason) });
  }

  private async send(reason: RebuildReason): Promise<void> {
    try {
      const token = await this.usersService.getIdToken();
      if (!token) return;
      const headers = new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
      await firstValueFrom(this.http.post(REQUEST_REBUILD_URL, { reason }, { headers }));
    } catch (error) {
      console.warn('No se pudo avisar del cambio para reconstruir la tienda:', error);
    }
  }
}
