import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from, map } from 'rxjs';
import { UsersService } from '../services/users/users.service';
import { NzMessageService } from 'ng-zorro-antd/message';

export const adminOnlyGuard: CanActivateFn = (route, state) => {
  const usersService = inject(UsersService);
  const router = inject(Router);
  const message = inject(NzMessageService);

  // Verificamos si el usuario tiene específicamente el rol 'admin'
  return from(usersService.hasRole('admin')).pipe(
    map(isAdmin => {
      if (isAdmin) {
        return true; // Si es admin, puede pasar
      } else {
        // Si no es admin (ej. es un distribuidor), le negamos el paso
        message.error('Acción no permitida. No tienes permisos de administrador.');
        // Lo redirigimos a una ruta segura, como su propio panel
        router.navigate(['/admin/my-inventory']); 
        return false;
      }
    })
  );
};