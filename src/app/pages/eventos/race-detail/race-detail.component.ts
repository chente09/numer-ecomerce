import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, take, takeUntil } from 'rxjs';

// Modelos y Servicios
import { Race } from '../../../models/race.model';
import { RaceService } from '../../../services/races/race/race-service.service';
import { SeoService } from '../../../services/seo/seo.service';
import { UsersService } from '../../../services/users/users.service';
import { InscriptionService } from '../../../services/races/inscription/inscription.service.service';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { LoginModalComponent } from '../../../components/login-modal/login-modal.component';

// NG-Zorro
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzImageModule, NzImageService } from 'ng-zorro-antd/image';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { RaceInscriptionModalComponent } from "../race-inscription-modal/race-inscription-modal.component";

@Component({
  selector: 'app-race-detail',
  standalone: true,
  imports: [
    CommonModule,
    NzCardModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzSpinModule,
    NzEmptyModule,
    NzGridModule,
    NzImageModule,
    NzBreadCrumbModule,
    NzDividerModule,
    NzProgressModule,
    NzModalModule,
    RaceInscriptionModalComponent,
    LoginModalComponent
  ],
  templateUrl: './race-detail.component.html',
  styleUrls: ['./race-detail.component.css']
})
export class RaceDetailComponent implements OnInit, OnDestroy {

  race: Race | null = null;
  loading = true;
  notFound = false;
  showInscriptionModalVisible = false;
  showLoginModal = false;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private raceService: RaceService,
    private seoService: SeoService,
    private message: NzMessageService,
    private nzImageService: NzImageService,
    private usersService: UsersService,
    private inscriptionService: InscriptionService,
    private modal: NzModalService
  ) { }

  ngOnInit(): void {
    // Obtener el slug de la URL
    const slug = this.route.snapshot.paramMap.get('slug');

    if (!slug) {
      this.notFound = true;
      this.loading = false;
      return;
    }

    this.loadRaceBySlug(slug);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadRaceBySlug(slug: string): void {
    this.raceService.getRaceBySlug(slug)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (race) => {
          if (race) {
            this.race = race;
            this.updateSEO(race);
            this.loading = false;
          } else {
            this.notFound = true;
            this.loading = false;
          }
        },
        error: (error) => {
          console.error('Error cargando evento:', error);
          this.notFound = true;
          this.loading = false;
          this.message.error('Error al cargar el evento');
        }
      });
  }

  private updateSEO(race: Race): void {
    this.seoService.updatePageSEO('evento-detalle', {
      title: `${race.nombre} - Eventos NUMER`,
      description: race.descripcion || `${race.nombre} - ${race.ciudad}, ${race.provincia}`,
      keywords: `${race.nombre}, ${race.tipoEvento}, ${race.dificultad}, eventos outdoor Ecuador`,
      image: race.imagenPrincipal
    });
  }

  // ==================== MÉTODOS DE ESTADO ====================

  hasAvailableSlots(): boolean {
    if (!this.race || !this.race.cupoMaximo) return true;
    return this.race.inscritosActuales < this.race.cupoMaximo;
  }

  getOccupancyPercentage(): number {
    if (!this.race || !this.race.cupoMaximo) return 0;
    return (this.race.inscritosActuales / this.race.cupoMaximo) * 100;
  }

  isInscriptionOpen(): boolean {
    if (!this.race) return false;
    const now = new Date();
    const inscriptionOpen = !this.race.fechaInscripcionInicio || this.race.fechaInscripcionInicio <= now;
    const inscriptionNotClosed = this.race.fechaInscripcionCierre && this.race.fechaInscripcionCierre > now;
    return inscriptionOpen && inscriptionNotClosed;
  }

  getDaysUntilClose(): number {
    if (!this.race || !this.race.fechaInscripcionCierre) return 0;
    const now = new Date();
    const diff = this.race.fechaInscripcionCierre.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  getEventStatus(): 'upcoming' | 'open' | 'closing-soon' | 'closed' | 'finished' {
    if (!this.race) return 'finished';

    const now = new Date();

    if (this.race.fecha && this.race.fecha < now) {
      return 'finished';
    }

    if (this.race.fechaInscripcionCierre && this.race.fechaInscripcionCierre < now) {
      return 'closed';
    }

    if (this.race.fechaInscripcionInicio && this.race.fechaInscripcionInicio > now) {
      return 'upcoming';
    }

    const daysUntilClose = this.getDaysUntilClose();
    if (daysUntilClose > 0 && daysUntilClose <= 7) {
      return 'closing-soon';
    }

    return 'open';
  }

  getEventStatusText(): string {
    const status = this.getEventStatus();
    const daysUntilClose = this.getDaysUntilClose();

    switch (status) {
      case 'finished':
        return 'Evento Finalizado';
      case 'closed':
        return 'Inscripciones Cerradas';
      case 'upcoming':
        if (this.race?.fechaInscripcionInicio) {
          return `Abre ${this.race.fechaInscripcionInicio.toLocaleDateString('es-EC', {
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

  getDifficultyColor(): string {
    if (!this.race) return 'default';
    const colors: { [key: string]: string } = {
      'principiante': 'green',
      'intermedio': 'blue',
      'avanzado': 'orange',
      'elite': 'red'
    };
    return colors[this.race.dificultad] || 'default';
  }

  getEventTypeColor(): string {
    if (!this.race) return 'default';
    const colors: { [key: string]: string } = {
      'trail-running': 'magenta',
      'ciclismo': 'cyan',
      'mtb': 'lime',
      'triathlon': 'purple',
      'montana': 'geekblue',
      'caminata': 'green',
      'otro': 'default'
    };
    return colors[this.race.tipoEvento] || 'default';
  }

  // ==================== ACCIONES ====================

  goToInscription(): void {
    if (!this.race) return;

    const status = this.getEventStatus();

    if (status === 'finished') {
      this.message.warning('Este evento ya finalizó');
      return;
    }

    if (status === 'closed') {
      this.message.warning('Las inscripciones para este evento ya cerraron');
      return;
    }

    if (status === 'upcoming') {
      const dateText = this.race.fechaInscripcionInicio
        ? this.race.fechaInscripcionInicio.toLocaleDateString('es-EC', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
        : 'pronto';
      this.message.info(`Las inscripciones abrirán el ${dateText}`);
      return;
    }

    if (!this.hasAvailableSlots()) {
      this.message.warning('Este evento ya no tiene cupos disponibles');
      return;
    }

    // TODO: Implementar flujo de inscripción
    this.message.info('Funcionalidad de inscripción en construcción. Usuario debe estar logueado.');
  }

  goBack(): void {
    this.router.navigate(['/eventos']);
  }

  openGoogleMaps(): void {
    if (!this.race?.coordenadas) {
      this.message.warning('No hay coordenadas disponibles para este evento');
      return;
    }

    const url = `https://www.google.com/maps?q=${this.race.coordenadas.lat},${this.race.coordenadas.lng}`;
    window.open(url, '_blank');
  }

  shareEvent(): void {
    if (!this.race) return;

    const url = window.location.href;

    if (navigator.share) {
      navigator.share({
        title: this.race.nombre,
        text: this.race.descripcion || '',
        url: url
      }).catch(() => {
        this.copyToClipboard(url);
      });
    } else {
      this.copyToClipboard(url);
    }
  }

  private copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.message.success('Enlace copiado al portapapeles');
    }).catch(() => {
      this.message.error('No se pudo copiar el enlace');
    });
  }

  // ==================== CARRITO DE COMPRAS ====================

  // ✅ DESPUÉS - Validación completa
  async addToCart(): Promise<void> {
    if (!this.race) return;

    // 1. Verificar estado del evento
    const status = this.getEventStatus();

    if (status === 'finished') {
      this.message.warning('Este evento ya finalizó');
      return;
    }

    if (status === 'closed') {
      this.message.warning('Las inscripciones para este evento ya cerraron');
      return;
    }

    if (status === 'upcoming') {
      this.message.info('Las inscripciones aún no están abiertas');
      return;
    }

    if (!this.hasAvailableSlots()) {
      this.message.warning('Este evento ya no tiene cupos disponibles');
      return;
    }

    // 2. Verificar si usuario está logueado
    const currentUser = this.usersService.getCurrentUser();

    if (!currentUser) {
      sessionStorage.setItem('returnUrl', this.router.url);
      this.showLoginModal = true;
      return;
    }

    // 3. Verificar si el perfil está completo
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
            sessionStorage.setItem('returnUrl', this.router.url);
            this.router.navigate(['/mi-cuenta']);
          }
        });

        return;
      }

      // 4. Verificar si ya está inscrito
      this.inscriptionService.isUserRegistered(currentUser.uid, this.race.id!)
        .pipe(take(1))
        .subscribe({
          next: (isRegistered) => {
            if (isRegistered) {
              this.modal.info({
                nzTitle: 'Ya estás inscrito',
                nzContent: 'Ya tienes una inscripción activa para este evento. Puedes revisar tus inscripciones en "Mi Cuenta".',
                nzOkText: 'Ver Mis Inscripciones',
                nzOnOk: () => {
                  this.router.navigate(['/mi-cuenta/inscripciones']);
                }
              });
              return;
            }

            // 5. Todo OK - Abrir modal de inscripción
            this.openInscriptionModal();
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

    // Reintentar el proceso de inscripción automáticamente
    setTimeout(() => {
      this.addToCart();
    }, 500);
  }

  handleLoginModalClosed(): void {
    this.showLoginModal = false;
  }

  // ✅ AGREGAR ESTOS MÉTODOS AL FINAL DE LA CLASE (antes del último })

  openInscriptionModal(): void {
    this.showInscriptionModalVisible = true;
  }

  handleInscriptionCreated(inscriptionId: string): void {
    console.log('Inscripción creada:', inscriptionId);

    // Cerrar modal
    this.showInscriptionModalVisible = false;

    // Recargar evento para actualizar contador
    if (this.race?.slug) {
      this.loadRaceBySlug(this.race.slug);
    }

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
  }

  async buyNow(): Promise<void> {
    // Ejecutar el mismo flujo de validación que addToCart
    await this.addToCart();

    // TODO: Cuando se implemente checkout, agregar flag para ir directo
    // La diferencia es que después de crear la inscripción,
    // redirige a checkout en vez de al carrito
  }

}