export class TimestampUtil {
    /**
     * Convierte un timestamp de Firestore o una fecha en un objeto Date
     * @param timestamp Timestamp de Firestore, objeto Date, número o string
     * @returns Objeto Date
     */
    static toDate(timestamp: any): Date {
        if (!timestamp) {
            return new Date();
        }

        // Si es un objeto con método toDate (Firestore Timestamp)
        if (timestamp && typeof timestamp.toDate === 'function') {
            return timestamp.toDate();
        }

        // Si ya es un objeto Date
        if (timestamp instanceof Date) {
            return timestamp;
        }

        // Si es un número (timestamp en milisegundos)
        if (typeof timestamp === 'number') {
            return new Date(timestamp);
        }

        // Si es una cadena, intentar convertirla a fecha
        if (typeof timestamp === 'string') {
            const parsed = Date.parse(timestamp);
            if (!isNaN(parsed)) {
                return new Date(parsed);
            }
        }

        // Si no se pudo convertir, retornar la fecha actual
        return new Date();
    }

    /**
     * Formatea una fecha para mostrarla al usuario
     * @param date Fecha a formatear
     * @param format Formato deseado (default: 'dd/MM/yyyy HH:mm')
     * @returns Cadena formateada
     */
    static formatDate(date: Date | any, format: string = 'dd/MM/yyyy HH:mm'): string {
        const dateObj = this.toDate(date);

        // Implementación básica de formato (podría usar librería como date-fns)
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');

        return format
            .replace('dd', day)
            .replace('MM', month)
            .replace('yyyy', String(year))
            .replace('HH', hours)
            .replace('mm', minutes);
    }

    /**
     * Compara dos fechas
     * @param date1 Primera fecha
     * @param date2 Segunda fecha
     * @returns Negativo si date1 < date2, 0 si son iguales, positivo si date1 > date2
     */
    static compareDates(date1: any, date2: any): number {
        const d1 = this.toDate(date1);
        const d2 = this.toDate(date2);
        return d1.getTime() - d2.getTime();
    }

    /**
     * Verifica si una fecha está entre dos fechas
     * @param date Fecha a verificar
     * @param startDate Fecha de inicio
     * @param endDate Fecha de fin
     * @returns true si la fecha está en el rango, false en caso contrario
     */
    static isDateInRange(date: any, startDate: any, endDate: any): boolean {
        const d = this.toDate(date);
        const start = this.toDate(startDate);
        const end = this.toDate(endDate);

        return d >= start && d <= end;
    }
}