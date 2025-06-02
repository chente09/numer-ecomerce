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

      if (user.isAnonymous) {
        if (state.url.includes('/pago')) {
          message.warning('Necesitas una cuenta registrada para completar la compra');
        } else {
          message.warning('Necesitas una cuenta registrada para acceder a esta página');
        }

        return from(Promise.resolve(router.createUrlTree(['/completar-perfil'], {
          queryParams: { returnUrl: state.url }
        })));
      }

      return from(usersService.isProfileCompleteForCheckout()).pipe(
        map(validation => {
          if (validation.complete) {
            return true;
          }

          const missingInfo = [
            ...validation.missingFields,
            ...(validation.missingAddress ? ['Dirección de envío completa'] : [])
          ].join(', ');

          message.warning(`Completa tu perfil para continuar. Falta: ${missingInfo}`);

          return router.createUrlTree(['/completar-perfil'], {
            queryParams: {
              returnUrl: state.url,
              action: 'checkout'
            }
          });
        })
      );
    })
  );
};
