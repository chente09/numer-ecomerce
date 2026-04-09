import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormControl } from '@angular/forms';

// Modelos y Servicios
import { Race } from '../../../models/race.model';
import { RaceService } from '../../../services/races/race/race-service.service';
import {
  RACE_TYPES,
  RACE_DIFFICULTIES,
  ECUADORIAN_PROVINCES
} from '../../../models/race.model';
import { RaceInscriptionModalComponent } from '../race-inscription-modal/race-inscription-modal.component';
import { UsersService } from '../../../services/users/users.service';
import { InscriptionService } from '../../../services/races/inscription/inscription.service.service';
import { NzModalService } from 'ng-zorro-antd/modal';
import { take } from 'rxjs';

// NG-Zorro
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzInputModule } from 'ng-zorro-antd/input';
import { LoginModalComponent } from "../../../components/login-modal/login-modal.component";

@Component({
  selector: 'app-races',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzCardModule,
    NzGridModule,
    NzIconModule,
    NzTagModule,
    NzButtonModule,
    NzEmptyModule,
    NzSpinModule,
    NzFormModule,
    NzSelectModule,
    NzDatePickerModule,
    NzSwitchModule,
    NzToolTipModule,
    NzBadgeModule,
    NzInputModule,
    RaceInscriptionModalComponent,
    LoginModalComponent
  ],
  templateUrl: './races.component.html',
  styleUrls: ['./races.component.css']
})
export class RacesComponent implements OnInit {

  loading = true;
  allRaces: Race[] = [];
  filteredRaces: Race[] = [];
  filterForm: FormGroup;
  hasError = false;
  searchControl: FormControl<string | null> = new FormControl(null);
  selectedRaceForInscription: Race | null = null;
  showInscriptionModalVisible = false;
  showLoginModal = false;

  // Constantes para los <select>
  readonly raceTypes = RACE_TYPES;
  readonly raceDifficulties = RACE_DIFFICULTIES;
  readonly ecuadorianProvinces = ECUADORIAN_PROVINCES;

  constructor(
    private raceService: RaceService,
    private fb: FormBuilder,
    private router: Router,
    private message: NzMessageService,
    private usersService: UsersService,           // ✅ AGREGAR
    private inscriptionService: InscriptionService, // ✅ AGREGAR
    private modal: NzModalService
  ) {
    this.filterForm = this.fb.group({
      searchText: this.searchControl,
      dificultad: [null],
      provincia: [null],
      fechaDesde: [null],
      soloDisponibles: [true]
    });
  }

  ngOnInit(): void {
    this.loadRaces();
    this.setupFilters();
  }

  private loadRaces(): void {
    this.raceService.getRacesPublic().subscribe({
      next: (allRaces) => {
        const now = new Date();

        // Separar eventos activos de finalizados
        const activeRaces: Race[] = [];
        const finishedRaces: Race[] = [];

        allRaces.forEach(race => {
          const isActive = race.activo === true;
          const isPublished = race.publicado === true;

          // Solo mostrar eventos activos y publicados
          if (isActive && isPublished) {
            // Verificar si el evento ya pasó
            if (race.fecha && race.fecha < now) {
              finishedRaces.push(race);
            } else {
              activeRaces.push(race);
            }
          }
        });

        // Ordenar eventos activos por fecha (más cercanos primero)
        this.allRaces = activeRaces.sort((a, b) => {
          return a.fecha.getTime() - b.fecha.getTime();
        });

        // Guardar eventos finalizados (por si queremos mostrarlos después)
        // Por ahora solo guardamos activos

        this.filteredRaces = [...this.allRaces];
        this.loading = false;
        this.hasError = false;

        // Aplicar filtros iniciales
        this.applyFilters();
      },
      error: (error) => {
        console.error('❌ ERROR al cargar eventos:', error);
        this.loading = false;
        this.hasError = true;
        this.message.error('No se pudieron cargar los eventos. Por favor intenta nuevamente.');
      }
    });
  }

  private setupFilters(): void {
    this.filterForm.valueChanges.subscribe(() => {
      this.applyFilters();
    });
  }

  private applyFilters(): void {
    const filters = this.filterForm.value;
    let filtered = [...this.allRaces];

    // Búsqueda por texto
    if (filters.searchText && filters.searchText.trim() !== '') {
      const searchLower = filters.searchText.toLowerCase().trim();
      filtered = filtered.filter(r =>
        (r.nombre && r.nombre.toLowerCase().includes(searchLower)) ||
        (r.descripcion && r.descripcion.toLowerCase().includes(searchLower)) ||
        (r.ciudad && r.ciudad.toLowerCase().includes(searchLower)) ||
        (r.ubicacion && r.ubicacion.toLowerCase().includes(searchLower))
      );
    }

    // Filtro por tipo de evento
    if (filters.tipoEvento) {
      filtered = filtered.filter(r => r.tipoEvento === filters.tipoEvento);
    }

    // Filtro por dificultad
    if (filters.dificultad) {
      filtered = filtered.filter(r => r.dificultad === filters.dificultad);
    }

    // Filtro por provincia
    if (filters.provincia) {
      filtered = filtered.filter(r => r.provincia === filters.provincia);
    }

    // Filtro por fecha desde
    if (filters.fechaDesde) {
      filtered = filtered.filter(r => {
        return r.fecha && r.fecha >= filters.fechaDesde;
      });
    }

    // Filtro por disponibilidad de cupos
    if (filters.soloDisponibles) {
      filtered = filtered.filter(r =>
        !r.cupoMaximo || (r.inscritosActuales < r.cupoMaximo)
      );
    }

    this.filteredRaces = filtered;
  }

  resetFilters(): void {
    this.filterForm.reset({
      searchText: null,
      tipoEvento: null,
      dificultad: null,
      provincia: null,
      fechaDesde: null,
      soloDisponibles: true
    });
  }

  viewRaceDetail(race: Race, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    if (!race.slug) {
      this.message.warning('Este evento no tiene un identificador válido');
      return;
    }

    this.router.navigate(['/eventos', race.slug]);
  }

  async goToInscription(race: Race, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }

    const status = this.getEventStatus(race);

    if (status === 'finished') {
      this.message.warning('Este evento ya finalizó');
      return;
    }

    if (status === 'closed') {
      this.message.warning('Las inscripciones para este evento ya cerraron');
      return;
    }

    if (status === 'upcoming') {
      const dateText = race.fechaInscripcionInicio
        ? race.fechaInscripcionInicio.toLocaleDateString('es-EC', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
        : 'pronto';
      this.message.info(`Las inscripciones abrirán el ${dateText}`);
      return;
    }

    if (!this.hasAvailableSlots(race)) {
      this.message.warning('Este evento ya no tiene cupos disponibles');
      return;
    }

    // Verificar si usuario está logueado
    const currentUser = this.usersService.getCurrentUser();

    if (!currentUser) {
      this.message.info('Debes iniciar sesión para inscribirte');

      if (race.slug) {
        sessionStorage.setItem('returnUrl', `/eventos/${race.slug}`);
      }
      this.showLoginModal = true;
      return;
    }

    // Verificar perfil completo
    try {
      const profileCheck = await this.usersService.isProfileCompleteForCheckout();

      if (!profileCheck.complete) {
        let missingInfo = 'Necesitas completar tu perfil antes de inscribirte.';

        if (profileCheck.missingFields.length > 0) {
          missingInfo += ` Campos faltantes: ${profileCheck.missingFields.join(', ')}.`;
        }

        if (profileCheck.missingAddress) {
          missingInfo += ' También necesitas agregar una dirección.';
        }

        this.modal.warning({
          nzTitle: 'Perfil Incompleto',
          nzContent: missingInfo,
          nzOkText: 'Completar Perfil',
          nzOnOk: () => {
            if (race.slug) {
              sessionStorage.setItem('returnUrl', `/eventos/${race.slug}`);
            }
            this.router.navigate(['/mi-cuenta']);
          }
        });

        return;
      }

      // Verificar si ya está inscrito
      this.inscriptionService.isUserRegistered(currentUser.uid, race.id!)
        .pipe(take(1))
        .subscribe({
          next: (isRegistered) => {
            if (isRegistered) {
              this.modal.info({
                nzTitle: 'Ya estás inscrito',
                nzContent: 'Ya tienes una inscripción activa para este evento.',
                nzOkText: 'Ver Mis Inscripciones',
                nzOnOk: () => {
                  this.router.navigate(['/mi-cuenta/inscripciones']);
                }
              });
              return;
            }

            // Todo OK - Abrir modal
            this.openInscriptionModal(race);
          },
          error: (error) => {
            console.error('Error verificando inscripción:', error);
            this.message.error('Error al verificar tu inscripción. Intenta nuevamente.');
          }
        });

    } catch (error) {
      console.error('Error verificando perfil:', error);
      this.message.error('Error al verificar tu perfil. Intenta nuevamente.');
    }
  }

  handleLoginSuccess(): void {
    this.showLoginModal = false;

    // Mensaje de bienvenida
    this.message.success('¡Bienvenido! Ahora puedes continuar con tu inscripción');
  }

  handleLoginModalClosed(): void {
    this.showLoginModal = false;
  }

  openInscriptionModal(race: Race): void {
    this.selectedRaceForInscription = race;
    this.showInscriptionModalVisible = true;
  }

  handleInscriptionCreated(inscriptionId: string): void {
    console.log('Inscripción creada:', inscriptionId);

    // Cerrar modal
    this.showInscriptionModalVisible = false;
    this.selectedRaceForInscription = null;

    // Recargar eventos para actualizar contador
    this.loadRaces();

    // Mostrar modal de éxito
    this.modal.success({
      nzTitle: 'Inscripción Exitosa',
      nzContent: 'Tu inscripción se ha creado correctamente. Ahora serás redirigido al checkout para completar el pago.',
      nzOnOk: () => {
        // TODO: Navegar a checkout
        // this.router.navigate(['/checkout', inscriptionId]);
        this.message.info('Funcionalidad de checkout en desarrollo');
      }
    });
  }

  handleInscriptionModalClosed(): void {
    this.showInscriptionModalVisible = false;
    this.selectedRaceForInscription = null;
  }

  hasAvailableSlots(race: Race): boolean {
    if (!race.cupoMaximo) return true;
    return race.inscritosActuales < race.cupoMaximo;
  }

  getOccupancyPercentage(race: Race): number {
    if (!race.cupoMaximo) return 0;
    return (race.inscritosActuales / race.cupoMaximo) * 100;
  }

  isInscriptionOpen(race: Race): boolean {
    const now = new Date();
    const inscriptionOpen = !race.fechaInscripcionInicio || race.fechaInscripcionInicio <= now;
    const inscriptionNotClosed = race.fechaInscripcionCierre && race.fechaInscripcionCierre > now;
    return inscriptionOpen && inscriptionNotClosed;
  }

  getDaysUntilClose(race: Race): number {
    if (!race.fechaInscripcionCierre) return 0;
    const now = new Date();
    const diff = race.fechaInscripcionCierre.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
 * Obtener el estado actual del evento
 */
  getEventStatus(race: Race): 'upcoming' | 'open' | 'closing-soon' | 'closed' | 'finished' {
    const now = new Date();

    // 1. Evento ya pasó (fecha del evento < hoy)
    if (race.fecha && race.fecha < now) {
      return 'finished';
    }

    // 2. Inscripciones cerradas pero evento no ha pasado
    if (race.fechaInscripcionCierre && race.fechaInscripcionCierre < now) {
      return 'closed';
    }

    // 3. Inscripciones no han abierto (fecha inicio en el futuro)
    if (race.fechaInscripcionInicio && race.fechaInscripcionInicio > now) {
      return 'upcoming';
    }

    // 4. Últimos días (menos de 7 días para cerrar)
    const daysUntilClose = this.getDaysUntilClose(race);
    if (daysUntilClose > 0 && daysUntilClose <= 7) {
      return 'closing-soon';
    }

    // 5. Inscripciones abiertas normalmente
    return 'open';
  }

  /**
   * Obtener texto descriptivo del estado
   */
  getEventStatusText(race: Race): string {
    const status = this.getEventStatus(race);
    const daysUntilClose = this.getDaysUntilClose(race);

    switch (status) {
      case 'finished':
        return 'Evento Finalizado';
      case 'closed':
        return 'Inscripciones Cerradas';
      case 'upcoming':
        if (race.fechaInscripcionInicio) {
          return `Abre ${race.fechaInscripcionInicio.toLocaleDateString('es-EC', {
            day: 'numeric',
            month: 'short'
          })}`;
        }
        return 'Próximamente';
      case 'closing-soon':
        return `¡${daysUntilClose} días restantes!`;
      case 'open':
        return 'Inscripciones Abiertas';
      default:
        return '';
    }
  }

  /**
   * Obtener color del tag según estado
   */
  getEventStatusColor(race: Race): string {
    const status = this.getEventStatus(race);

    switch (status) {
      case 'finished':
        return 'default'; // Gris
      case 'closed':
        return 'red';
      case 'upcoming':
        return 'blue';
      case 'closing-soon':
        return 'orange';
      case 'open':
        return 'green';
      default:
        return 'default';
    }
  }

  /**
   * Verificar si el evento ya finalizó
   */
  isEventFinished(race: Race): boolean {
    return this.getEventStatus(race) === 'finished';
  }

  getDifficultyColor(difficulty: string): string {
    const colors: { [key: string]: string } = {
      'principiante': 'green',
      'intermedio': 'blue',
      'avanzado': 'orange',
      'elite': 'red'
    };
    return colors[difficulty] || 'default';
  }

  getEventTypeColor(eventType: string): string {
    const colors: { [key: string]: string } = {
      'trail-running': 'magenta',
      'ciclismo': 'cyan',
      'mtb': 'lime',
      'triathlon': 'purple',
      'montana': 'geekblue',
      'caminata': 'green',
      'otro': 'default'
    };
    return colors[eventType] || 'default';
  }

  getInscriptionButtonText(race: Race): string {
    const status = this.getEventStatus(race);

    switch (status) {
      case 'finished':
        return 'Evento Finalizado';
      case 'closed':
        return 'Inscripciones Cerradas';
      case 'upcoming':
        return 'Próximamente';
      case 'closing-soon':
      case 'open':
        if (!this.hasAvailableSlots(race)) {
          return 'Cupos Agotados';
        }
        return 'Inscribirse Ahora';
      default:
        return 'Ver Detalles';
    }
  }

  getInscriptionTooltip(race: Race): string {
    const status = this.getEventStatus(race);

    switch (status) {
      case 'finished':
        return 'Este evento ya finalizó';
      case 'closed':
        return 'Las inscripciones ya cerraron';
      case 'upcoming':
        if (race.fechaInscripcionInicio) {
          return `Las inscripciones abren el ${race.fechaInscripcionInicio.toLocaleDateString('es-EC')}`;
        }
        return 'Las inscripciones abrirán pronto';
      case 'closing-soon':
        return `¡Últimos ${this.getDaysUntilClose(race)} días para inscribirte!`;
      case 'open':
        if (!this.hasAvailableSlots(race)) {
          return 'Este evento ya no tiene cupos disponibles';
        }
        return 'Haz clic para inscribirte en este evento (requiere login)';
      default:
        return 'Ver más información del evento';
    }
  }
}