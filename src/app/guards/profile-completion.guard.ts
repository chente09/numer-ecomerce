import { CanActivateFn, Router } from '@angular/router';
import { UsersService } from '../services/users/users.service';
import { inject } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { from, map, switchMap, take } from 'rxjs';

export const profileCompletionGuard: CanActivateFn = (route, state) => {
  const usersService = inject(UsersService);
  const router = inject(Router);
  const message = inject(NzMessageService);

  return usersService.user$.pipe(
    take(1),
    switchMap(user => {
      if (!user) {
        message.warning('Debes iniciar sesión para acceder a esta página');
        return from(Promise.resolve(router.createUrlTree(['/welcome'])));
      }
      
      // Convertir la promesa en observable
      return from(usersService.isProfileComplete()).pipe(
        map(isComplete => {
          if (isComplete) {
            return true; // Permite el acceso si el perfil está completo
          } else {
            message.warning('Debes completar tu perfil para continuar');
            return router.createUrlTree(['/completar-perfil']);
          }
        })
      );
    })
  );
};