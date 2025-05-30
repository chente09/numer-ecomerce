import { CanActivateFn, Router } from '@angular/router';
import { UsersService } from '../services/users/users.service';
import { inject } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { from, map, switchMap, take } from 'rxjs';

export const adminGuardGuard: CanActivateFn = (route, state) => {
  const usersService = inject(UsersService);
  const router = inject(Router);
  const message = inject(NzMessageService);

  return usersService.user$.pipe(
    switchMap(user => {
      if (!user) {
        message.warning('Acceso denegado');
        return from(Promise.resolve(router.createUrlTree(['/welcome'])));
      }
      
      // Verificar si el usuario tiene rol de administrador
      return from(usersService.hasRole('admin')).pipe(
        map(isAdmin => {
          if (isAdmin) {
            return true;
          } else {
            message.error('No tienes permisos para acceder a esta sección');
            return router.createUrlTree(['/welcome']);
          }
        })
      );
    })
  );
};
