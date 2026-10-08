import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, timer, switchMap } from 'rxjs';

/**
 * Descarga en segundo plano solo las rutas marcadas con `data: { preload: true }` (tienda,
 * producto, carrito), unos segundos después de que la portada ya cargó. El resto (el panel de
 * administración, por ejemplo) se descarga únicamente cuando alguien entra a esas pantallas.
 */
@Injectable({ providedIn: 'root' })
export class SelectivePreloadStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] ? timer(2500).pipe(switchMap(() => load())) : of(null);
  }
}
