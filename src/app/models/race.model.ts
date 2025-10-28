// ==================== INTERFACES PARA CARRERAS ====================

export interface Race {
    id: string;
    nombre: string;
    descripcion: string;
    fecha: Date;
    horaInicio: string;
    ubicacion: string;
    ciudad: string;
    provincia: string;

    // Clasificación
    tipoEvento: 'trail-running' | 'ciclismo' | 'triathlon' | 'montana' | 'caminata' | 'otro';
    categoria: 'competitivo' | 'recreativo' | 'familiar';
    dificultad: 'principiante' | 'intermedio' | 'avanzado' | 'elite';

    // Detalles deportivos
    distancia?: string; // Ej: "21K", "42K", "50km"
    denivelePositivo?: number; // metros
    altitudMaxima?: number; // msnm

    // Comercial
    precio: number;
    precioAntesDescuento?: number; // Para mostrar descuentos
    cupoMaximo?: number;
    inscritosActuales: number;

    // Información adicional
    requisitos?: string[]; // ["Mayor de edad", "Certificado médico"]
    incluye?: string[]; // ["Hidratación", "Medalla finisher", "Chip cronometraje"]
    premios?: string[];
    sponsors?: string[];

    // Multimedia
    imagenPrincipal?: string;
    galeria?: string[];
    videoPromo?: string;

    // Ubicación GPS
    coordenadas?: {
        lat: number;
        lng: number;
    };

    // Organización
    organizadorId?: string;
    organizadorNombre?: string;
    contactoEmail?: string;
    contactoTelefono?: string;

    // Estado
    activo: boolean;
    destacado?: boolean; // Para mostrar en home
    publicado: boolean; // false = borrador

    // Fechas límite
    fechaInscripcionInicio?: Date;
    fechaInscripcionCierre: Date;

    // Metadata
    slug: string; // URL amigable
    createdAt: Date;
    updatedAt: Date;
}

// ==================== INTERFACES PARA INSCRIPCIONES ====================

export interface RaceInscription {
    id: string;

    // Referencias
    raceId: string;
    raceName: string; // Desnormalizado para facilitar consultas
    userId: string;

    // Datos del participante
    participante: {
        nombre: string;
        apellido: string;
        email: string;
        telefono: string;
        cedula: string; // o documento de identidad
        fechaNacimiento: Date;
        genero: 'masculino' | 'femenino' | 'otro';

        // Dirección
        ciudad: string;
        provincia: string;
        direccion?: string;

        // Datos deportivos
        clubDeportivo?: string;
        experienciaPrevia?: string; // "principiante", "5-10 carreras", "más de 10"
    };

    // Información de emergencia
    contactoEmergencia: {
        nombre: string;
        telefono: string;
        relacion: string; // "padre", "madre", "esposo/a", "amigo/a"
    };

    // Preferencias
    tallaCamiseta: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
    necesitaTransporte?: boolean;
    restriccionesAlimenticias?: string;
    condicionesMedicas?: string;

    // Información del pago
    payment: {
        transactionId: string;
        amount: number;
        currency: string;
        status: 'pending' | 'completed' | 'failed' | 'refunded';
        paymentDate?: Date;
        paymentMethod?: string; // "tarjeta", "transferencia"
    };

    // Estado de la inscripción
    status: 'pending-payment' | 'confirmed' | 'cancelled' | 'attended' | 'dns' | 'dnf';
    // dns = did not start, dnf = did not finish

    // Extras
    numeroDorsal?: string; // Asignado después del pago
    tiempoOficial?: string; // Resultado final "HH:MM:SS"
    posicionGeneral?: number;
    posicionCategoria?: number;

    // Documentación
    certificadoMedicoUrl?: string;
    comprobanteUrl?: string;

    // Aceptación de términos
    aceptaTerminos: boolean;
    aceptaDeslinde: boolean; // Deslinde de responsabilidad

    // Metadata
    createdAt: Date;
    updatedAt: Date;
    confirmedAt?: Date;
    cancelledAt?: Date;
}

// ==================== INTERFACES AUXILIARES ====================

export interface RaceFilter {
    categoria?: string;
    dificultad?: string;
    tipoEvento?: string;
    provincia?: string;
    fechaDesde?: Date;
    fechaHasta?: Date;
    precioMax?: number;
    soloDisponibles?: boolean; // Con cupos disponibles
}

export interface InscriptionSummary {
    inscriptionId: string;
    raceName: string;
    raceDate: Date;
    participantName: string;
    status: string;
    amount: number;
    createdAt: Date;
}

// ==================== TIPOS DE UTILIDAD ====================

export type RaceStatus = 'upcoming' | 'ongoing' | 'finished' | 'cancelled';
export type InscriptionStatus = RaceInscription['status'];
export type PaymentStatus = RaceInscription['payment']['status'];

// ==================== CONSTANTES ====================

export const RACE_TYPES = [
    { value: 'trail-running', label: 'Trail Running' },
    { value: 'mtb', label: 'Ciclismo de Montaña' },
    { value: 'ciclismo', label: 'Ciclismo de Ruta' },
    { value: 'triathlon', label: 'Triatlón' },
    { value: 'montana', label: 'Montañismo' },
    { value: 'caminata', label: 'Caminata Ecológica' },
    { value: 'otro', label: 'Otro' }
] as const;

export const RACE_CATEGORIES = [
    { value: 'competitivo', label: 'Competitivo' },
    { value: 'recreativo', label: 'Recreativo' },
    { value: 'familiar', label: 'Familiar' }
] as const;

export const RACE_DIFFICULTIES = [
    { value: 'principiante', label: 'Principiante' },
    { value: 'intermedio', label: 'Intermedio' },
    { value: 'avanzado', label: 'Avanzado' },
    { value: 'elite', label: 'Elite' }
] as const;

export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

export const ECUADORIAN_PROVINCES = [
    'Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi',
    'El Oro', 'Esmeraldas', 'Galápagos', 'Guayas', 'Imbabura', 'Loja',
    'Los Ríos', 'Manabí', 'Morona Santiago', 'Napo', 'Orellana',
    'Pastaza', 'Pichincha', 'Santa Elena', 'Santo Domingo de los Tsáchilas',
    'Sucumbíos', 'Tungurahua', 'Zamora Chinchipe'
] as const;