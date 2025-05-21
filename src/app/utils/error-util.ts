// src/app/utils/error-util.ts
import { Observable, throwError } from 'rxjs';

export class ErrorUtil {
    /**
     * Formatea un error para mostrar un mensaje amigable
     * @param error El error a formatear
     * @param context Contexto donde ocurrió el error
     * @returns Un mensaje de error formateado
     */
    static formatError(error: unknown, context: string): string {
        let errorMessage = 'Error desconocido';

        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (error !== null && error !== undefined) {
            try {
                errorMessage = JSON.stringify(error);
            } catch {
                errorMessage = String(error);
            }
        }

        return `Error en ${context}: ${errorMessage}`;
    }

    /**
     * Registra y lanza un error como Observable
     * @param error El error ocurrido
     * @param context Contexto donde ocurrió el error
     * @returns Un Observable que emite un error
     */
    static handleError(error: unknown, context: string): Observable<never> {
        const formattedError = this.formatError(error, context);
        console.error(formattedError);
        return throwError(() => new Error(formattedError));
    }

    /**
     * Maneja errores en bloques try-catch
     * @param error El error capturado
     * @param context Contexto donde ocurrió el error
     * @throws Error formateado
     */
    static handleCatchError(error: unknown, context: string): never {
        const formattedError = this.formatError(error, context);
        console.error(formattedError);
        throw new Error(formattedError);
    }
}