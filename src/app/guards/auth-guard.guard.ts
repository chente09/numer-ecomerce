import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { UsersService } from '../services/users/users.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const usersService = inject(UsersService);
  const router = inject(Router);
  const message = inject(NzMessageService);

  return usersService.user$.pipe(
    take(1),
    map(user => {
      const isLoggedIn = !!user;
      
      if (isLoggedIn) {
        return true; // Permite el acceso a la ruta
      } else {
        // Mostrar mensaje al usuario
        message.warning('Debes iniciar sesión para acceder a esta página');
        
        // Redirigir a la página principal
        return router.createUrlTree(['/welcome']);
      }
    })
  );
};