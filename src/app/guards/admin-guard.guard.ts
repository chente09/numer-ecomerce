import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { from, map, Observable, switchMap } from 'rxjs';
import { UsersService } from '../services/users/users.service';
import { NzMessageService } from 'ng-zorro-antd/message';

export const adminGuardGuard: CanActivateFn = (route, state): Observable<boolean | UrlTree> => {
  const usersService = inject(UsersService);
  const router = inject(Router);
  const message = inject(NzMessageService);

  return usersService.user$.pipe(
    switchMap(user => {
      if (!user) {
        message.warning('Acceso denegado. Debes iniciar sesión.');
        return from(Promise.resolve(router.createUrlTree(['/welcome'])));
      }
      
      // 🔄 En lugar de hasRole('admin'), obtenemos todos los roles del usuario.
      // Esto es más eficiente y escalable.
      return from(usersService.getUserRoles()).pipe(
        map(roles => {
          // ✅ La lógica clave: ¿El array de roles incluye 'admin' O 'distributor'?
          if (roles.includes('admin') || roles.includes('distributor')) {
            return true; // Si tiene cualquiera de los dos roles, permite el acceso.
          } else {
            message.error('No tienes los permisos necesarios para acceder a esta sección');
            return router.createUrlTree(['/welcome']);
          }
        })
      );
    })
  );
};