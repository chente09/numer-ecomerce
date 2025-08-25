import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NzModalModule, NzModalRef } from 'ng-zorro-antd/modal';

// Módulos de NG-Zorro que usaremos en el modal
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzDividerModule } from 'ng-zorro-antd/divider';

// Definimos una interfaz para la información de envío para tener un tipado fuerte
export interface ShippingInfo {
  shippingType: 'store' | 'client';
  clientName?: string;
  clientPhone?: string;
  clientAddress?: string;
  shippingNotes?: string;
}

@Component({
  selector: 'app-shipping-info-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzButtonModule,
    NzRadioModule,
    NzDividerModule,
    NzModalModule
  ],
  templateUrl: './shipping-info-modal.component.html',
  styleUrls: ['./shipping-info-modal.component.css']
})
export class ShippingInfoModalComponent implements OnInit {

  shippingForm: FormGroup;
  shippingType: 'store' | 'client' = 'store';

  constructor(
    private fb: FormBuilder,
    private modalRef: NzModalRef<ShippingInfoModalComponent> // Referencia al modal para cerrarlo
  ) {
    this.shippingForm = this.fb.group({
      shippingType: ['store', [Validators.required]],
      clientName: [null],
      clientPhone: [null],
      clientAddress: [null],
      shippingNotes: ['']
    });
  }

  // En shipping-info-modal.component.ts

  ngOnInit(): void {
    // Escuchamos los cambios en el tipo de envío para actualizar las validaciones
    this.shippingForm.get('shippingType')?.valueChanges.subscribe(type => {
      this.shippingType = type;
      this.updateValidators(type);
    });
  }

  // Actualiza los validadores de los campos dependiendo del tipo de envío seleccionado
  private updateValidators(type: 'store' | 'client'): void {
    const clientName = this.shippingForm.get('clientName');
    const clientPhone = this.shippingForm.get('clientPhone');
    const clientAddress = this.shippingForm.get('clientAddress');

    if (type === 'client') {
      // Si es envío a cliente, todos los campos son requeridos
      clientName?.setValidators([Validators.required, Validators.minLength(3)]);
      clientPhone?.setValidators([Validators.required, Validators.pattern('^[0-9]{10}$')]); // Valida un teléfono de 10 dígitos
      clientAddress?.setValidators([Validators.required, Validators.minLength(10)]);
    } else {
      // Si es envío a la tienda, no son requeridos
      clientName?.clearValidators();
      clientPhone?.clearValidators();
      clientAddress?.clearValidators();
    }

    // Actualizamos la validez de los controles
    clientName?.updateValueAndValidity();
    clientPhone?.updateValueAndValidity();
    clientAddress?.updateValueAndValidity();
  }

  // ✅ AÑADE ESTE NUEVO MÉTODO
  handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    // Si la tecla presionada es 'r' o 'm', detenemos la propagación del evento.
    if (key === 'r' || key === 'm') {
      event.stopPropagation();
    }
  }

  // Se ejecuta al hacer clic en el botón "Confirmar Envío"
  submitForm(): void {
    if (this.shippingForm.valid) {
      // Si el formulario es válido, cerramos el modal y devolvemos los datos
      this.modalRef.close(this.shippingForm.value as ShippingInfo);
    } else {
      // Si es inválido, marcamos los campos para mostrar los errores
      Object.values(this.shippingForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }

  // Cierra el modal sin devolver datos
  closeModal(): void {
    this.modalRef.destroy();
  }
}