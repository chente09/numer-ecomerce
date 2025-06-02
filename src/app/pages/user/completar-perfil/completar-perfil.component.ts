import { Component, OnInit, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UsersService } from '../../../services/users/users.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { User } from '@angular/fire/auth';
import { Subscription } from 'rxjs';

// Ng-Zorro imports
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSelectModule } from 'ng-zorro-antd/select';

@Component({
  selector: 'app-completar-perfil',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzGridModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzCardModule,
    NzDividerModule,
    NzIconModule,
    NzSpinModule,
    NzAlertModule,
    NzDatePickerModule,
    NzSelectModule
  ],
  templateUrl: './completar-perfil.component.html',
  styleUrl: './completar-perfil.component.css'
})
export class CompletarPerfilComponent implements OnInit, OnDestroy {

  profileForm: FormGroup;
  isSubmitting = false;
  loading = true;
  currentUser: User | null = null;
  returnUrl = '/perfil'; // URL por defecto
  userProfile: any = null;

  actionContext: 'register' | 'complete' = 'complete';

  private userSubscription: Subscription | null = null;

  constructor(
    private fb: FormBuilder,
    private usersService: UsersService,
    private message: NzMessageService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.profileForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      lastName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      phone: ['', [Validators.required, this.ecuadorianPhoneValidator()]],

      // 🎂 Fecha de nacimiento con validación mejorada
      birthDate: ['', [Validators.required, this.minimumAgeValidator(13)]],

      // 🆕 Documento de identidad con validación dinámica
      documentType: ['cedula', Validators.required],
      documentNumber: ['', [Validators.required, this.getDocumentValidator('cedula')]],

      // Campos de dirección
      address: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(200)]],
      city: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      province: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      canton: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      neighborhood: ['', [Validators.maxLength(50)]],
      postalCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      reference: ['', [Validators.maxLength(200)]],

      // 🆕 Contactos adicionales (opcionales)
      alternativePhone: ['', [this.optionalPhoneValidator()]],
      emergencyContact: ['', [Validators.maxLength(100)]],
      emergencyPhone: ['', [this.optionalPhoneValidator()]]
    });
  }

  // 🛠️ Validador de edad mínima corregido
  private minimumAgeValidator(minAge: number) {
    return (control: AbstractControl) => {
      if (!control.value) return null;

      const birthDate = new Date(control.value);
      const today = new Date();

      // Verificar que la fecha sea válida
      if (isNaN(birthDate.getTime())) {
        return { invalidDate: true };
      }

      // Calcular edad exacta
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      return age >= minAge ? null : { minimumAge: { requiredAge: minAge, actualAge: age } };
    };
  }

  // 🛠️ Validador de teléfono ecuatoriano mejorado
  private ecuadorianPhoneValidator() {
    return (control: AbstractControl) => {
      if (!control.value) return null;

      const phonePattern = /^0[2-9]\d{8}$/;
      return phonePattern.test(control.value) ? null : { ecuadorianPhone: true };
    };
  }

  // 🛠️ Validador de teléfono opcional
  private optionalPhoneValidator() {
    return (control: AbstractControl) => {
      if (!control.value || control.value.trim() === '') return null;

      const phonePattern = /^0[2-9]\d{8}$/;
      return phonePattern.test(control.value) ? null : { ecuadorianPhone: true };
    };
  }

  // 🛠️ Validador dinámico para documentos
  private getDocumentValidator(documentType: string) {
    return (control: AbstractControl) => {
      if (!control.value) return null;

      const value = control.value.toString().trim();

      switch (documentType) {
        case 'cedula':
          // Cédula ecuatoriana: 10 dígitos con validación de provincia y verificador
          if (!/^\d{10}$/.test(value)) {
            return { invalidCedula: { message: 'La cédula debe tener 10 dígitos' } };
          }
          return this.validateEcuadorianCedula(value) ? null : { invalidCedula: { message: 'Cédula inválida' } };

        case 'ruc':
          // RUC: 13 dígitos
          if (!/^\d{13}$/.test(value)) {
            return { invalidRuc: { message: 'El RUC debe tener 13 dígitos' } };
          }
          return null;

        case 'pasaporte':
          // Pasaporte: 6-12 caracteres alfanuméricos
          if (!/^[A-Z0-9]{6,12}$/i.test(value)) {
            return { invalidPassport: { message: 'Pasaporte debe tener 6-12 caracteres alfanuméricos' } };
          }
          return null;

        default:
          return null;
      }
    };
  }

  // 🛠️ Validación específica de cédula ecuatoriana
  private validateEcuadorianCedula(cedula: string): boolean {
    if (cedula.length !== 10) return false;

    const digits = cedula.split('').map(Number);
    const provinceCode = parseInt(cedula.substring(0, 2));

    // Validar código de provincia (01-24)
    if (provinceCode < 1 || provinceCode > 24) return false;

    // Algoritmo de validación del dígito verificador
    const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let sum = 0;

    for (let i = 0; i < 9; i++) {
      let result = digits[i] * coefficients[i];
      if (result >= 10) result -= 9;
      sum += result;
    }

    const verifier = (Math.ceil(sum / 10) * 10) - sum;
    return verifier === digits[9];
  }

  // 🆕 Método para fechas deshabilitadas
  disabledDate = (current: Date): boolean => {
    const today = new Date();
    const maxAge = new Date();
    maxAge.setFullYear(today.getFullYear() - 120); // Máximo 120 años

    // Deshabilitar fechas futuras y muy antiguas
    return current > today || current < maxAge;
  };

  ngOnInit() {
    // Obtener contexto y returnUrl
    this.route.queryParams.subscribe(params => {
      this.returnUrl = params['returnUrl'] || '/perfil';
      this.actionContext = params['action'] || 'complete';
    });

    // 🛠️ Listener para cambio de tipo de documento
    this.profileForm.get('documentType')?.valueChanges.subscribe(documentType => {
      const documentNumberControl = this.profileForm.get('documentNumber');
      if (documentNumberControl) {
        // Limpiar el valor actual y aplicar nueva validación
        documentNumberControl.setValue('');
        documentNumberControl.setValidators([
          Validators.required,
          this.getDocumentValidator(documentType)
        ]);
        documentNumberControl.updateValueAndValidity();
      }
    });

    // Suscripción al usuario
    this.userSubscription = this.usersService.user$.subscribe(async user => {
      this.currentUser = user;

      if (!user) {
        this.message.warning('Debes iniciar sesión primero');
        this.router.navigate(['/welcome'], {
          queryParams: { returnUrl: this.returnUrl }
        });
        return;
      }

      if (user.isAnonymous) {
        this.loading = false;
        return;
      }

      // Verificar si ya puede continuar
      try {
        const isComplete = await this.usersService.isProfileComplete();
        if (isComplete && this.returnUrl === '/perfil') {
          this.message.success('Tu perfil ya está completo');
          this.router.navigate([this.returnUrl]);
          return;
        }
      } catch (error) {
        console.log('Error verificando perfil completo:', error);
      }

      await this.loadExistingProfile();
      this.loading = false;
    });
  }

  // 🛠️ CORRECCIÓN: Manejar fechas correctamente para el DatePicker
  async loadExistingProfile() {
    try {
      this.userProfile = await this.usersService.getUserProfile();

      if (this.userProfile) {
        // 🛠️ CORRECCIÓN: Convertir birthDate correctamente
        let birthDateValue = null;
        if (this.userProfile.birthDate) {
          try {
            // Manejar diferentes formatos de fecha
            if (this.userProfile.birthDate.toDate) {
              // Firebase Timestamp
              birthDateValue = this.userProfile.birthDate.toDate();
            } else if (typeof this.userProfile.birthDate === 'string') {
              // String ISO o fecha
              birthDateValue = new Date(this.userProfile.birthDate);
            } else if (this.userProfile.birthDate instanceof Date) {
              // Ya es un objeto Date
              birthDateValue = this.userProfile.birthDate;
            }
            
            // Verificar que la fecha sea válida
            if (birthDateValue && isNaN(birthDateValue.getTime())) {
              console.warn('Fecha de nacimiento inválida, usando null');
              birthDateValue = null;
            }
          } catch (error) {
            console.warn('Error procesando fecha de nacimiento:', error);
            birthDateValue = null;
          }
        }

        // Pre-llenar con todos los datos del perfil
        this.profileForm.patchValue({
          firstName: this.userProfile.firstName || '',
          lastName: this.userProfile.lastName || '',
          phone: this.userProfile.phone || '',
          birthDate: birthDateValue, // 🛠️ CORRECCIÓN: Usar fecha procesada
          documentType: this.userProfile.documentType || 'cedula',
          documentNumber: this.userProfile.documentNumber || '',
          alternativePhone: this.userProfile.alternativePhone || '',
          emergencyContact: this.userProfile.emergencyContact || '',
          emergencyPhone: this.userProfile.emergencyPhone || ''
        });

        // Cargar dirección por defecto si existe
        try {
          const addresses = await this.usersService.getUserAddresses();
          const defaultAddress = addresses.find(addr => addr.isDefault);

          if (defaultAddress) {
            this.profileForm.patchValue({
              address: defaultAddress.address || '',
              city: defaultAddress.city || '',
              province: defaultAddress.province || '',
              canton: defaultAddress.canton || '',
              neighborhood: defaultAddress.neighborhood || '',
              postalCode: defaultAddress.postalCode || '',
              reference: defaultAddress.reference || ''
            });
          }
        } catch (addressError) {
          console.log('No se pudieron cargar direcciones:', addressError);
        }
      }
    } catch (error) {
      console.error('Error al cargar perfil existente:', error);
    }
  }

  async signUpWithGoogle() {
    try {
      const result = await this.usersService.loginWithGoogle();
      if (result.user) {
        this.message.success('¡Registro exitoso! Ahora completa tu información.');
      }
    } catch (error) {
      console.error('Error al registrarse con Google:', error);
      this.message.error('No se pudo completar el registro. Intenta nuevamente.');
    }
  }

  async onSubmit() {
    if (this.profileForm.invalid) {
      Object.keys(this.profileForm.controls).forEach(key => {
        const control = this.profileForm.get(key);
        control?.markAsDirty();
        control?.updateValueAndValidity();
      });

      this.message.warning('Por favor completa todos los campos correctamente');
      this.scrollToFirstError();
      return;
    }

    this.isSubmitting = true;

    try {
      const user = this.usersService.getCurrentUser();
      if (!user) throw new Error('Usuario no autenticado');

      // 🛠️ CORRECCIÓN: Procesar fecha de nacimiento antes de guardar
      let birthDateToSave = null;
      if (this.profileForm.value.birthDate) {
        try {
          if (this.profileForm.value.birthDate instanceof Date) {
            birthDateToSave = this.profileForm.value.birthDate;
          } else {
            birthDateToSave = new Date(this.profileForm.value.birthDate);
          }
          
          // Verificar que la fecha sea válida
          if (isNaN(birthDateToSave.getTime())) {
            throw new Error('Fecha inválida');
          }
        } catch (error) {
          console.error('Error procesando fecha de nacimiento:', error);
          this.message.error('La fecha de nacimiento no es válida');
          this.isSubmitting = false;
          return;
        }
      }

      // Preparar datos del perfil
      const profileData = {
        firstName: this.profileForm.value.firstName.trim(),
        lastName: this.profileForm.value.lastName.trim(),
        phone: this.profileForm.value.phone.trim(),
        birthDate: birthDateToSave, // 🛠️ CORRECCIÓN: Usar fecha procesada
        documentType: this.profileForm.value.documentType,
        documentNumber: this.profileForm.value.documentNumber.trim(),
        alternativePhone: this.profileForm.value.alternativePhone?.trim() || null,
        emergencyContact: this.profileForm.value.emergencyContact?.trim() || null,
        emergencyPhone: this.profileForm.value.emergencyPhone?.trim() || null,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        profileCompleted: true,
        updatedAt: new Date(),
        createdAt: this.userProfile?.createdAt || new Date()
      };

      await this.usersService.saveUserProfile(profileData);

      // Guardar dirección
      if (this.profileForm.value.address) {
        const addressData = {
          name: 'Dirección Principal',
          address: this.profileForm.value.address.trim(),
          city: this.profileForm.value.city.trim(),
          province: this.profileForm.value.province.trim(),
          canton: this.profileForm.value.canton.trim(),
          neighborhood: this.profileForm.value.neighborhood?.trim() || '',
          postalCode: this.profileForm.value.postalCode.trim(),
          reference: this.profileForm.value.reference?.trim() || '',
          isDefault: true
        };

        await this.usersService.saveUserAddress(addressData);
      }

      const successMessage = this.actionContext === 'register'
        ? '¡Registro completado! Ya puedes realizar tu compra.'
        : '¡Perfil actualizado correctamente!';

      this.message.success(successMessage);

      // 🛠️ CORRECCIÓN: Manejar navegación con query parameters
      if (this.returnUrl && this.returnUrl.includes('/pago')) {
        this.message.info('Redirigiendo al checkout...');

        // Decodificar la URL y separar path de query params
        const decodedUrl = decodeURIComponent(this.returnUrl);
        const [path, queryString] = decodedUrl.split('?');

        if (queryString) {
          // Parsear query parameters
          const queryParams: any = {};
          queryString.split('&').forEach(param => {
            const [key, value] = param.split('=');
            queryParams[key] = decodeURIComponent(value || '');
          });

          // Navegar con query parameters separados
          setTimeout(() => {
            this.router.navigate([path], { queryParams });
          }, 1500);
        } else {
          // Navegar sin query parameters
          setTimeout(() => {
            this.router.navigate([path]);
          }, 1500);
        }
      } else {
        // Navegación normal para otros casos
        setTimeout(() => {
          this.router.navigate([this.returnUrl || '/perfil']);
        }, 1000);
      }

    } catch (error) {
      console.error('Error al guardar perfil:', error);
      this.message.error('No se pudo guardar la información. Intenta nuevamente.');
    } finally {
      this.isSubmitting = false;
    }
  }

  // 🛠️ Método para hacer scroll al primer error
  private scrollToFirstError() {
    const firstErrorElement = document.querySelector('.ant-form-item-has-error');
    if (firstErrorElement) {
      firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // 🛠️ CORRECCIÓN: Navegación mejorada en goBack
  goBack() {
    if (this.returnUrl && this.returnUrl.includes('/pago')) {
      // Si venía del checkout, volver al carrito
      this.router.navigate(['/carrito']);
    } else if (this.returnUrl !== '/perfil') {
      // Intentar navegar a la URL de retorno decodificada
      try {
        const decodedUrl = decodeURIComponent(this.returnUrl);
        const [path] = decodedUrl.split('?');
        this.router.navigate([path]);
      } catch (error) {
        console.error('Error navegando de vuelta:', error);
        this.router.navigate(['/welcome']);
      }
    } else {
      this.router.navigate(['/welcome']);
    }
  }

  // 🆕 Getters para mensajes contextuales
  get headerMessage(): string {
    if (this.actionContext === 'register') {
      return 'Completa tu Registro';
    }
    return 'Completa tu Perfil';
  }

  get descriptionMessage(): string {
    if (this.actionContext === 'register') {
      return 'Para completar tu compra, necesitamos algunos datos adicionales';
    }
    return 'Necesitamos algunos datos adicionales para procesar tus pedidos correctamente';
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }
}