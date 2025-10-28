// races.component.ts - VERSIÓN SIMPLIFICADA Y FUNCIONAL

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

// Modelos y Servicios
import { Race } from '../../models/race.model';
import { RaceService } from '../../services/races/race/race-service.service';
import { 
  RACE_TYPES, 
  RACE_DIFFICULTIES, 
  ECUADORIAN_PROVINCES 
} from '../../models/race.model';

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
    NzInputModule
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

  // Constantes para los <select>
  readonly raceTypes = RACE_TYPES;
  readonly raceDifficulties = RACE_DIFFICULTIES;
  readonly ecuadorianProvinces = ECUADORIAN_PROVINCES;

  constructor(
    private raceService: RaceService,
    private fb: FormBuilder,
    private router: Router,
    private message: NzMessageService
  ) {
    this.filterForm = this.fb.group({
      searchText: [null],
      tipoEvento: [null],
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
    // Usar getRaces() en lugar de getActiveRaces() para simplificar
    this.raceService.getRaces().subscribe({
      next: (allRaces) => {
        console.log('✅ Carreras recibidas:', allRaces.length);
        
        // Filtrar carreras activas manualmente
        const now = new Date();
        this.allRaces = allRaces.filter(race => {
          const isActive = race.activo === true;
          const isPublished = race.publicado === true;
          const isOpen = race.fechaInscripcionCierre && race.fechaInscripcionCierre > now;
          
          return isActive && isPublished && isOpen;
        });
        
        console.log('✅ Carreras activas:', this.allRaces.length);
        
        this.filteredRaces = [...this.allRaces];
        this.loading = false;
        this.hasError = false;
        
        // Aplicar filtros iniciales
        this.applyFilters();
      },
      error: (error) => {
        console.error('❌ ERROR al cargar carreras:', error);
        this.loading = false;
        this.hasError = true;
        this.message.error('No se pudieron cargar las carreras. Por favor intenta nuevamente.');
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
    
    // Si existe slug, navegar a detalle, sino mostrar mensaje
    if (race.slug) {
      this.router.navigate(['/carreras', race.slug]);
    } else {
      this.message.info('Página de detalle en construcción');
    }
  }

  goToInscription(race: Race, event: Event): void {
    event.stopPropagation();
    
    // Verificar disponibilidad
    if (race.cupoMaximo && race.inscritosActuales >= race.cupoMaximo) {
      this.message.warning('Esta carrera ya no tiene cupos disponibles');
      return;
    }

    // Verificar si las inscripciones están abiertas
    const now = new Date();
    if (race.fechaInscripcionCierre && race.fechaInscripcionCierre < now) {
      this.message.warning('Las inscripciones para esta carrera ya cerraron');
      return;
    }

    if (race.fechaInscripcionInicio && race.fechaInscripcionInicio > now) {
      this.message.warning('Las inscripciones para esta carrera aún no están abiertas');
      return;
    }

    // Por ahora mostrar mensaje
    // TODO: Implementar navegación a página de inscripción
    this.message.info('Funcionalidad de inscripción en construcción. Usuario debe estar logueado.');
    
    // Cuando tengas la página de detalle, descomenta esto:
    // if (race.slug) {
    //   this.router.navigate(['/carreras', race.slug], { 
    //     queryParams: { action: 'inscribirse' } 
    //   });
    // }
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
    if (!this.hasAvailableSlots(race)) {
      return 'Cupos Agotados';
    }
    if (!this.isInscriptionOpen(race)) {
      return 'Inscripciones Cerradas';
    }
    return 'Inscribirse Ahora';
  }

  getInscriptionTooltip(race: Race): string {
    if (!this.hasAvailableSlots(race)) {
      return 'Esta carrera ya no tiene cupos disponibles';
    }
    if (!this.isInscriptionOpen(race)) {
      const now = new Date();
      if (race.fechaInscripcionInicio && race.fechaInscripcionInicio > now) {
        return `Las inscripciones abren el ${race.fechaInscripcionInicio.toLocaleDateString()}`;
      }
      return 'Las inscripciones ya cerraron';
    }
    return 'Haz clic para inscribirte en esta carrera (requiere login)';
  }
}