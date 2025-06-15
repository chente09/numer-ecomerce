
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

// Ng-Zorro imports
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCarouselModule } from 'ng-zorro-antd/carousel';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzImageModule } from 'ng-zorro-antd/image';
import { ReactiveFormsModule } from '@angular/forms';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzTimePickerModule } from 'ng-zorro-antd/time-picker';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';

interface MediaContent {
  id: string;
  tipo: 'imagen' | 'video' | 'story';
  url: string;
  thumbnail?: string;
  titulo: string;
  descripcion: string;
  fecha: Date;
  ubicacion?: string;
  tags?: string[];
}

interface Embajador {
  id: string;
  nombre: string;
  apellido: string;
  nickname?: string;
  ciudad: string;
  provincia: string;
  especialidades: string[]; // Cambio de deportes a especialidades (deportes, viajes, etc.)
  especialidadPrincipal: string;
  categoria: 'deportista' | 'viajero' | 'aventurero' | 'influencer';
  nivel: 'amateur' | 'semi-pro' | 'profesional' | 'elite';
  stravaProfile?: string;
  instagramProfile?: string;
  youtubeChannel?: string;
  tiktokProfile?: string;
  blogUrl?: string;
  biografia: string;
  logros: string[];
  equipoNumer: string[];
  fechaColaboracion: Date;
  activo: boolean;
  avatar?: string;
  coverImage?: string; // Imagen de portada
  tipo: 'embajador' | 'atleta-patrocinado';
  estadisticas?: {
    seguidores?: number;
    kilometrosMes?: number;
    paisesVisitados?: number;
    eventosCompletados?: number;
    contenidoCreado?: number;
  };
  mediaContent: MediaContent[]; // Galería multimedia
  historiaDestacada?: string; // Historia principal del embajador
  certificaciones?: string[]; // Certificaciones o títulos
}

interface Evento {
  id: string;
  nombre: string;
  descripcion: string;
  fecha: Date;
  horaInicio: string;
  ubicacion: string;
  ciudad: string;
  provincia: string;
  tipoEvento: 'carrera' | 'ciclismo' | 'triathlon' | 'montañismo' | 'viaje' | 'expedicion' | 'workshop' | 'otro';
  categoria: 'deportivo' | 'aventura' | 'educativo' | 'social';
  dificultad: 'principiante' | 'intermedio' | 'avanzado' | 'elite';
  distancia?: string;
  precio?: number;
  cupoMaximo?: number;
  inscritosActuales: number;
  organizadorId: string;
  organizadorNombre?: string;
  requisitos?: string[];
  incluye?: string[]; // Qué incluye el evento
  premios?: string[];
  sponsors?: string[];
  activo: boolean;
  imagenEvento?: string;
  galeria?: string[]; // Galería de imágenes del evento
  coordenadas?: {
    lat: number;
    lng: number;
  };
  testimonios?: {
    autor: string;
    comentario: string;
    rating: number;
  }[];
}

@Component({
  selector: 'app-embajadores-atletas',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    NzCardModule,
    NzButtonModule,
    NzGridModule,
    NzIconModule,
    NzTagModule,
    NzAvatarModule,
    NzDividerModule,
    NzTabsModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzDatePickerModule,
    NzEmptyModule,
    NzSpinModule,
    NzTimePickerModule,
    NzInputNumberModule,
    NzCarouselModule
  ],
  templateUrl: './embajadores-atletas.component.html',
  styleUrl: './embajadores-atletas.component.css'
})
export class EmbajadoresAtletasComponent implements OnInit {

  // Estados del componente
  loading = true;
  selectedMember: Embajador | null = null;
  mediaModalVisible = false;
  selectedMediaContent: MediaContent[] = [];
  galeriaModalVisible = false;
  currentMediaIndex = 0;

  // Datos
  embajadores: Embajador[] = [];
  atletas: Embajador[] = [];
  eventos: Evento[] = [];
  eventosPorCategoria: { [key: string]: Evento[] } = {};

  // Configuraciones
  especialidadesDisponibles = [
    'Trail Running', 'Ciclismo', 'Montañismo', 'Escalada', 'Triatlón',
    'Viajes de Aventura', 'Fotografía de Viajes', 'Turismo Sostenible',
    'Expediciones', 'Senderismo', 'Camping', 'Kayak', 'Surf',
    'Creación de Contenido', 'Blogging de Viajes'
  ];

  constructor(
    private message: NzMessageService,
    private modal: NzModalService
  ) { }

  ngOnInit(): void {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading = true;
    try {
      await this.loadEmbajadores();
      await this.loadEventos();
      this.categorizarEventos();
    } catch (error) {
      console.error('Error cargando datos:', error);
      this.message.error('Error al cargar la información');
    } finally {
      this.loading = false;
    }
  }

  private async loadEmbajadores(): Promise<void> {
    // Datos de ejemplo expandidos
    const todosEmbajadores: Embajador[] = [
      {
        id: '1',
        nombre: 'Carlos',
        apellido: 'Rodríguez',
        nickname: 'CharlieRuns',
        ciudad: 'Quito',
        provincia: 'Pichincha',
        especialidades: ['Trail Running', 'Montañismo', 'Fotografía de Aventura'],
        especialidadPrincipal: 'Trail Running',
        categoria: 'deportista',
        nivel: 'profesional',
        stravaProfile: 'https://strava.com/athletes/12345',
        instagramProfile: '@charlieruns_ec',
        youtubeChannel: 'https://youtube.com/@charlieruns',
        biografia: 'Ultra runner y aventurero ecuatoriano especializado en carreras de montaña extremas. Documentando la belleza de los Andes a través del running y la fotografía.',
        historiaDestacada: 'En 2024 completé la travesía completa de la Cordillera Occidental del Ecuador en 15 días, cubriendo más de 800km de trail running entre volcanes.',
        logros: [
          'Campeón Nacional Ultra Trail 2024',
          'Top 10 UTMB Mont-Blanc 2023',
          'Récord Nacional 100K montaña',
          'Finalista Western States 2024'
        ],
        certificaciones: ['Guía de Montaña ASEGUIM', 'Instructor Trail Running IAAF'],
        equipoNumer: ['Chaqueta Aguacero Pro', 'Pantalón Sendero Elite', 'Mochila Cumbre 20L'],
        fechaColaboracion: new Date('2023-06-15'),
        activo: true,
        tipo: 'atleta-patrocinado',
        coverImage: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800',
        estadisticas: {
          seguidores: 25000,
          kilometrosMes: 500,
          eventosCompletados: 45,
          contenidoCreado: 150
        },
        mediaContent: [
          {
            id: '1-1',
            tipo: 'video',
            url: 'https://example.com/video1.mp4',
            thumbnail: 'https://images.unsplash.com/photo-1486218119243-13883505764c?w=400',
            titulo: 'Cotopaxi Ultra Challenge 2024',
            descripcion: 'Recorrido completo del ultra trail más extremo del Ecuador',
            fecha: new Date('2024-03-15'),
            ubicacion: 'Cotopaxi, Ecuador',
            tags: ['ultra trail', 'cotopaxi', 'running']
          },
          {
            id: '1-2',
            tipo: 'imagen',
            url: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800',
            titulo: 'Amanecer en el Chimborazo',
            descripcion: 'Momento mágico durante el entrenamiento matutino',
            fecha: new Date('2024-02-20'),
            ubicacion: 'Chimborazo, Ecuador'
          }
        ]
      },
      {
        id: '2',
        nombre: 'María',
        apellido: 'González',
        nickname: 'WanderMary',
        ciudad: 'Cuenca',
        provincia: 'Azuay',
        especialidades: ['Viajes de Aventura', 'Fotografía de Viajes', 'Turismo Sostenible'],
        especialidadPrincipal: 'Viajes de Aventura',
        categoria: 'viajero',
        nivel: 'semi-pro',
        instagramProfile: '@wandermary_ec',
        youtubeChannel: 'https://youtube.com/@wandermaryecuador',
        blogUrl: 'https://wandermary.blog',
        biografia: 'Exploradora y creadora de contenido especializada en turismo sostenible en Ecuador. Promociono destinos únicos y experiencias auténticas en nuestro país.',
        historiaDestacada: 'He recorrido todos los pisos climáticos del Ecuador en un solo año, desde la selva amazónica hasta los glaciares andinos, documentando la increíble biodiversidad del país.',
        logros: [
          'Embajadora Turismo Ecuador 2024',
          'Creadora del proyecto "Ecuador en 12 meses"',
          'Ganadora Nacional Geographic Travel Photography 2023'
        ],
        equipoNumer: ['Chaqueta Aguacero', 'Pantalón Trekking', 'Mochila Viajero 35L'],
        fechaColaboracion: new Date('2024-01-10'),
        activo: true,
        tipo: 'embajador',
        coverImage: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
        estadisticas: {
          seguidores: 18000,
          paisesVisitados: 25,
          contenidoCreado: 200,
          eventosCompletados: 30
        },
        mediaContent: [
          {
            id: '2-1',
            tipo: 'imagen',
            url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800',
            titulo: 'Quilotoa al Amanecer',
            descripcion: 'Capturando la magia de la laguna más hermosa del Ecuador',
            fecha: new Date('2024-01-15'),
            ubicacion: 'Quilotoa, Cotopaxi',
            tags: ['quilotoa', 'fotografia', 'amanecer']
          },
          {
            id: '2-2',
            tipo: 'story',
            url: 'https://example.com/story1',
            titulo: 'Expedición Yasuní',
            descripcion: 'Mi aventura de 7 días en el corazón de la Amazonía',
            fecha: new Date('2024-02-10'),
            ubicacion: 'Yasuní, Ecuador'
          }
        ]
      }
    ];

    this.embajadores = todosEmbajadores.filter(e => e.tipo === 'embajador');
    this.atletas = todosEmbajadores.filter(e => e.tipo === 'atleta-patrocinado');
  }

  private async loadEventos(): Promise<void> {
    this.eventos = [
      {
        id: '1',
        nombre: 'Trail Running Pichincha Challenge',
        descripcion: 'Desafío de trail running en las faldas del volcán Pichincha. Una experiencia única para corredores de montaña con vistas espectaculares.',
        fecha: new Date('2024-07-15'),
        horaInicio: '06:00',
        ubicacion: 'Teleférico de Quito',
        ciudad: 'Quito',
        provincia: 'Pichincha',
        tipoEvento: 'carrera',
        categoria: 'deportivo',
        dificultad: 'avanzado',
        distancia: '21K',
        precio: 35,
        cupoMaximo: 200,
        inscritosActuales: 145,
        organizadorId: '1',
        organizadorNombre: 'Carlos Rodríguez',
        requisitos: ['Experiencia en trail running', 'Equipo de montaña básico'],
        incluye: ['Hidratación en ruta', 'Medalla finisher', 'Camiseta técnica NUMER'],
        premios: ['Productos NUMER valorados en $500', 'Trofeos personalizados'],
        sponsors: ['NUMER', 'Teleférico Quito', 'PowerAde'],
        activo: true,
        imagenEvento: 'https://images.unsplash.com/photo-1544943910-4c1dc44aab44?w=800',
        galeria: [
          'https://images.unsplash.com/photo-1486218119243-13883505764c?w=400',
          'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400'
        ]
      },
      {
        id: '2',
        nombre: 'Expedición Fotográfica Cajas',
        descripcion: 'Aventura de 3 días combinando trekking y fotografía de paisajes en el Parque Nacional Cajas.',
        fecha: new Date('2024-08-20'),
        horaInicio: '08:00',
        ubicacion: 'Parque Nacional Cajas',
        ciudad: 'Cuenca',
        provincia: 'Azuay',
        tipoEvento: 'expedicion',
        categoria: 'aventura',
        dificultad: 'intermedio',
        precio: 180,
        cupoMaximo: 15,
        inscritosActuales: 12,
        organizadorId: '2',
        organizadorNombre: 'María González',
        incluye: ['Guía especializado', 'Equipo fotográfico', 'Alimentación completa', 'Transporte'],
        activo: true,
        imagenEvento: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800'
      }
    ];
  }

  private categorizarEventos(): void {
    const ahora = new Date();
    this.eventosPorCategoria = {
      'Próximos Eventos': this.eventos.filter(e => e.fecha > ahora && e.activo),
      'Deportivos': this.eventos.filter(e => e.categoria === 'deportivo' && e.activo),
      'Aventura y Viajes': this.eventos.filter(e => e.categoria === 'aventura' && e.activo)
    };
  }

  // ==================== MÉTODOS DE INTERACCIÓN ====================

  verPerfilCompleto(miembro: Embajador): void {
  this.selectedMember = miembro;
  this.selectedMediaContent = miembro.mediaContent || [];
  this.galeriaModalVisible = true;  // ← Cambiar aquí
}

  verContenidoMultimedia(miembro: Embajador): void {
    this.selectedMediaContent = miembro.mediaContent || [];
    if (this.selectedMediaContent.length > 0) {
      // Aquí podrías abrir un modal específico para la galería
      this.message.info(`Mostrando ${this.selectedMediaContent.length} elementos multimedia`);
    } else {
      this.message.info('Este miembro aún no tiene contenido multimedia');
    }
  }

  abrirRedSocial(url: string, tipo: string): void {
    if (!url) {
      this.message.warning(`Perfil de ${tipo} no disponible`);
      return;
    }

    let finalUrl = url;
    if (tipo === 'instagram' && !url.startsWith('http')) {
      finalUrl = `https://instagram.com/${url.replace('@', '')}`;
    }

    window.open(finalUrl, '_blank');
  }

  verDetallesEvento(evento: Evento): void {
    this.modal.info({
      nzTitle: evento.nombre,
      nzContent: `
        <div style="margin: 16px 0;">
          <p><strong>Fecha:</strong> ${evento.fecha.toLocaleDateString('es-ES')}</p>
          <p><strong>Ubicación:</strong> ${evento.ubicacion}, ${evento.ciudad}</p>
          <p><strong>Organiza:</strong> ${evento.organizadorNombre}</p>
          <p><strong>Precio:</strong> ${evento.precio ? '$' + evento.precio : 'Gratuito'}</p>
          <div style="margin-top: 12px;">
            <p><strong>Descripción:</strong></p>
            <p>${evento.descripcion}</p>
          </div>
        </div>
      `,
      nzWidth: 600
    });
  }

  inscribirseEvento(evento: Evento): void {
    if (evento.cupoMaximo && evento.inscritosActuales >= evento.cupoMaximo) {
      this.message.warning('Este evento ya alcanzó su cupo máximo');
      return;
    }

    this.modal.confirm({
      nzTitle: `¿Inscribirse en ${evento.nombre}?`,
      nzContent: `
        <div style="margin: 16px 0;">
          <p><strong>Evento:</strong> ${evento.fecha.toLocaleDateString('es-ES')}</p>
          <p><strong>Precio:</strong> ${evento.precio ? '$' + evento.precio : 'Gratuito'}</p>
          <p><strong>Cupos disponibles:</strong> ${evento.cupoMaximo ? (evento.cupoMaximo - evento.inscritosActuales) : 'Ilimitados'}</p>
        </div>
      `,
      nzOkText: 'Sí, inscribirse',
      nzCancelText: 'Cancelar',
      nzOnOk: () => {
        // Aquí redirigirías a un formulario de inscripción o proceso de pago
        this.message.success('¡Inscripción iniciada! Te redirigiremos al formulario.');
      }
    });
  }

  compartirEvento(evento: Evento): void {
    const textoCompartir = `¡Únete a ${evento.nombre}! ${evento.fecha.toLocaleDateString('es-ES')} en ${evento.ubicacion}`;

    if (navigator.share) {
      navigator.share({
        title: evento.nombre,
        text: textoCompartir,
        url: window.location.href + `#evento-${evento.id}`
      });
    } else {
      navigator.clipboard.writeText(textoCompartir + ` - ${window.location.href}#evento-${evento.id}`);
      this.message.success('¡Información del evento copiada al portapapeles!');
    }
  }

  cerrarModalMedia(): void {
    this.mediaModalVisible = false;
    this.selectedMember = null;
    this.selectedMediaContent = [];
  }

  // ==================== MÉTODOS DE UTILIDAD ====================

  getCategoriaColor(categoria: string): string {
    const colores = {
      'deportista': 'blue',
      'viajero': 'green',
      'aventurero': 'orange',
      'influencer': 'purple'
    };
    return colores[categoria as keyof typeof colores] || 'default';
  }

  getNivelColor(nivel: string): string {
    const colores = {
      'amateur': 'green',
      'semi-pro': 'blue',
      'profesional': 'purple',
      'elite': 'red'
    };
    return colores[nivel as keyof typeof colores] || 'default';
  }

  getTipoEventoIcon(tipo: string): string {
    const iconos = {
      'carrera': 'thunderbolt',
      'ciclismo': 'car',
      'triathlon': 'trophy',
      'montañismo': 'rise',
      'viaje': 'compass',
      'expedicion': 'environment',
      'workshop': 'book',
      'otro': 'star'
    };
    return iconos[tipo as keyof typeof iconos] || 'calendar';
  }

  getDificultadColor(dificultad: string): string {
    const colores = {
      'principiante': 'green',
      'intermedio': 'blue',
      'avanzado': 'orange',
      'elite': 'red'
    };
    return colores[dificultad as keyof typeof colores] || 'default';
  }

  getMediaIcon(tipo: string): string {
    const iconos = {
      'imagen': 'picture',
      'video': 'play-circle',
      'story': 'book'
    };
    return iconos[tipo as keyof typeof iconos] || 'file';
  }

  // ==================== TRACK BY FUNCTIONS ====================

  trackByMiembro(index: number, miembro: Embajador): string {
    return miembro.id;
  }

  trackByEvento(index: number, evento: Evento): string {
    return evento.id;
  }

  trackByMedia(index: number, media: MediaContent): string {
    return media.id;
  }

  // Método para formatear números grandes
  getFormattedNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  // Método para abrir galería completa
  abrirGaleriaCompleta(miembro: Embajador, startIndex: number = 0): void {
    this.selectedMember = miembro;
    this.selectedMediaContent = miembro.mediaContent || [];
    this.currentMediaIndex = startIndex;
    this.galeriaModalVisible = true;
  }

  // Método para cerrar galería
  cerrarGaleriaModal(): void {
    this.galeriaModalVisible = false;
    this.selectedMember = null;
    this.selectedMediaContent = [];
    this.currentMediaIndex = 0;
  }

}