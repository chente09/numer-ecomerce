import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';

// Modelos y Servicios
import { Race, SHIRT_SIZES } from '../../../models/race.model';
import { UsersService, UserProfile } from '../../../services/users/users.service';
import { InscriptionService } from '../../../services/races/inscription/inscription.service.service';

// NG-Zorro
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzGridModule } from 'ng-zorro-antd/grid';

@Component({
  selector: 'app-race-inscription-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzRadioModule,
    NzCheckboxModule,
    NzButtonModule,
    NzDividerModule,
    NzSpinModule,
    NzIconModule,
    NzGridModule
  ],
  templateUrl: './race-inscription-modal.component.html',
  styleUrls: ['./race-inscription-modal.component.css']
})
export class RaceInscriptionModalComponent implements OnInit {

  @Input() race!: Race;
  @Input() visible: boolean = false;

  @Output() inscriptionCreated = new EventEmitter<string>();
  @Output() modalClosed = new EventEmitter<void>();

  inscriptionForm!: FormGroup;
  userProfile: UserProfile | null = null;
  loading = false;
  loadingUserData = true;

  // Constantes para selects
  shirtSizes = SHIRT_SIZES;
  genderOptions = [
    { label: 'Masculino', value: 'masculino' },
    { label: 'Femenino', value: 'femenino' },
    { label: 'Otro', value: 'otro' }
  ];
  experienceOptions = [
    { label: 'Principiante', value: 'principiante' },
    { label: '5-10 carreras', value: '5-10 carreras' },
    { label: 'Más de 10 carreras', value: 'mas-de-10' }
  ];
  relationOptions = [
    { label: 'Padre', value: 'padre' },
    { label: 'Madre', value: 'madre' },
    { label: 'Esposo/a', value: 'esposo/a' },
    { label: 'Hermano/a', value: 'hermano/a' },
    { label: 'Amigo/a', value: 'amigo/a' },
    { label: 'Otro', value: 'otro' }
  ];

  constructor(
    private fb: FormBuilder,
    private usersService: UsersService,
    private inscriptionService: InscriptionService,
    private message: NzMessageService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    if (this.visible) {
      this.loadUserProfile();
    }
  }

  private initForm(): void {
    this.inscriptionForm = this.fb.group({
      // Información personal (readonly, pre-llenada)
      nombre: [{ value: '', disabled: true }],
      apellido: [{ value: '', disabled: true }],
      email: [{ value: '', disabled: true }],
      telefono: [{ value: '', disabled: true }],
      cedula: [{ value: '', disabled: true }],
      fechaNacimiento: [{ value: '', disabled: true }],
      ciudad: [{ value: '', disabled: true }],
      provincia: [{ value: '', disabled: true }],

      // Información deportiva (requerida)
      genero: [null, Validators.required],
      tallaCamiseta: [null, Validators.required],

      // Información deportiva (opcional)
      clubDeportivo: [''],
      experienciaPrevia: [''],

      // Contacto de emergencia (requerido)
      emergenciaNombre: ['', Validators.required],
      emergenciaTelefono: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
      emergenciaRelacion: [null, Validators.required],

      // Adicional (opcional)
      necesitaTransporte: [false],
      restriccionesAlimenticias: [''],
      condicionesMedicas: [''],

      // Términos (requeridos)
      aceptaTerminos: [false, Validators.requiredTrue],
      aceptaDeslinde: [false, Validators.requiredTrue]
    });
  }

  private async loadUserProfile(): Promise<void> {
    try {
      this.loadingUserData = true;

      // Obtener perfil del usuario SIN CACHÉ
      this.userProfile = await this.usersService.getUserProfile();

      if (!this.userProfile) {
        throw new Error('No se pudo cargar el perfil del usuario');
      }

      const currentUser = this.usersService.getCurrentUser();

      // Pre-llenar campos readonly
      this.inscriptionForm.patchValue({
        nombre: this.userProfile.firstName || '',
        apellido: this.userProfile.lastName || '',
        email: currentUser?.email || '',
        telefono: this.userProfile.phone || '',
        cedula: this.userProfile.documentNumber || '',
        fechaNacimiento: this.formatDate(this.userProfile.birthDate),
        ciudad: this.userProfile.defaultAddress?.city || '',
        provincia: this.userProfile.defaultAddress?.province || ''
      });

    } catch (error) {
      console.error('Error cargando perfil de usuario:', error);
      this.message.error('No se pudo cargar la información del usuario');
      this.handleCancel();
    } finally {
      this.loadingUserData = false;
    }
  }

  private formatDate(date: any): string {
    if (!date) return '';

    try {
      let dateObj: Date;

      if (date instanceof Date) {
        dateObj = date;
      } else if (date && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else if (date && typeof date === 'object' && date.seconds) {
        dateObj = new Date(date.seconds * 1000);
      } else {
        return '';
      }

      return dateObj.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      console.warn('Error formateando fecha:', error);
      return '';
    }
  }

  handleOk(): void {
    if (this.inscriptionForm.invalid) {
      Object.values(this.inscriptionForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      this.message.warning('Por favor, completa todos los campos requeridos');
      return;
    }

    this.createInscription();
  }

  handleCancel(): void {
    this.inscriptionForm.reset();
    this.modalClosed.emit();
  }

  private createInscription(): void {
    const currentUser = this.usersService.getCurrentUser();

    if (!currentUser || !this.userProfile) {
      this.message.error('Error de autenticación');
      return;
    }

    this.loading = true;

    const formValue = this.inscriptionForm.getRawValue();

    // Convertir fecha de nacimiento
    const birthDate = this.convertToDate(this.userProfile.birthDate);

    // ✅ Crear objeto participante SIN campos undefined
    const participanteData: any = {
      nombre: this.userProfile.firstName || '',
      apellido: this.userProfile.lastName || '',
      email: currentUser.email || '',
      telefono: this.userProfile.phone || '',
      cedula: this.userProfile.documentNumber || '',
      fechaNacimiento: birthDate,
      genero: formValue.genero,
      ciudad: this.userProfile.defaultAddress?.city || '',
      provincia: this.userProfile.defaultAddress?.province || ''
    };

    // Solo agregar campos opcionales SI tienen valor
    if (this.userProfile.defaultAddress?.address) {
      participanteData.direccion = this.userProfile.defaultAddress.address;
    }

    if (formValue.clubDeportivo?.trim()) {
      participanteData.clubDeportivo = formValue.clubDeportivo.trim();
    }

    if (formValue.experienciaPrevia) {
      participanteData.experienciaPrevia = formValue.experienciaPrevia;
    }

    // ✅ Crear objeto de inscripción SIN campos undefined
    const inscriptionData: any = {
      userId: currentUser.uid,
      raceId: this.race.id!,
      raceName: this.race.nombre,
      participante: participanteData,
      contactoEmergencia: {
        nombre: formValue.emergenciaNombre.trim(),
        telefono: formValue.emergenciaTelefono.trim(),
        relacion: formValue.emergenciaRelacion
      },
      tallaCamiseta: formValue.tallaCamiseta,
      necesitaTransporte: formValue.necesitaTransporte || false,
      aceptaTerminos: formValue.aceptaTerminos,
      aceptaDeslinde: formValue.aceptaDeslinde
    };

    // Solo agregar campos opcionales SI tienen valor
    if (formValue.restriccionesAlimenticias?.trim()) {
      inscriptionData.restriccionesAlimenticias = formValue.restriccionesAlimenticias.trim();
    }

    if (formValue.condicionesMedicas?.trim()) {
      inscriptionData.condicionesMedicas = formValue.condicionesMedicas.trim();
    }

    // ✅ NO incluir certificadoMedicoUrl, numeroDorsal, etc. (se agregan después del pago)

    // Llamar al servicio de inscripción
    this.inscriptionService.createInscription(inscriptionData)
      .pipe(take(1))
      .subscribe({
        next: (inscriptionId) => {
          this.loading = false;
          this.message.success('¡Inscripción creada exitosamente!');
          this.inscriptionCreated.emit(inscriptionId);
          this.inscriptionForm.reset();
        },
        error: (error) => {
          this.loading = false;
          console.error('Error creando inscripción:', error);

          const errorMessage = error?.message || error?.toString() || '';

          if (errorMessage.includes('Ya tienes una inscripción')) {
            this.message.warning(errorMessage);
          } else if (errorMessage.includes('no tiene cupos')) {
            this.message.error('Lo sentimos, este evento ya no tiene cupos disponibles');
          } else {
            this.message.error('Error al crear la inscripción. Por favor, intenta nuevamente.');
          }
        }
      });
  }

  private convertToDate(value: any): Date {
    if (!value) return new Date();

    if (value instanceof Date) {
      return value;
    }

    if (value && typeof value.toDate === 'function') {
      return value.toDate();
    }

    if (value && typeof value === 'object' && value.seconds !== undefined) {
      return new Date(value.seconds * 1000);
    }

    if (typeof value === 'string') {
      return new Date(value);
    }

    return new Date();
  }

  /**
   * Previene conflictos de eventos en inputs (Solución bug teclado)
   */
  onInputKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  /**
   * Actualiza el FormControl directamente sin emitir eventos adicionales
   */
  onInputChange(event: Event, fieldName: string): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target) {
      this.inscriptionForm.patchValue({
        [fieldName]: target.value
      }, { emitEvent: false });
    }
  }
}