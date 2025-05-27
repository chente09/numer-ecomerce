import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterOutlet } from '@angular/router';

// Módulos básicos de NG-ZORRO más utilizados en tu proyecto
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';

// Imports básicos de Angular (esenciales para casi todos los componentes)
export const ANGULAR_ESSENTIALS = [
    CommonModule,           // *ngFor, *ngIf, pipes básicos
    FormsModule,           // [(ngModel)]
    ReactiveFormsModule,   // FormBuilder, FormGroup
    RouterLink,            // [routerLink]
    RouterOutlet          // <router-outlet>
] as const;

// Módulos de NG-ZORRO más comunes en tu proyecto
export const NZ_COMMON_MODULES = [
    NzButtonModule,        // nz-button
    NzCardModule,          // nz-card
    NzFormModule,          // nz-form
    NzInputModule,         // nz-input
    NzIconModule,          // nz-icon
    NzModalModule,         // nz-modal
    NzToolTipModule,       // nz-tooltip
    NzSpinModule,          // nz-spin (loading)
    NzEmptyModule,          // nz-empty
    
] as const;

// Módulos para tablas y formularios (componentes admin)
export const NZ_ADMIN_MODULES = [
    NzTableModule,         // nz-table
    NzPopconfirmModule,    // nz-popconfirm
    ...NZ_COMMON_MODULES
] as const;

// Combinación completa (para componentes que necesitan todo)
export const ALL_COMMON_IMPORTS = [
    ...ANGULAR_ESSENTIALS,
    ...NZ_COMMON_MODULES
] as const;

// Combinación para componentes de administración
export const ADMIN_COMMON_IMPORTS = [
    ...ANGULAR_ESSENTIALS,
    ...NZ_ADMIN_MODULES
] as const;

// Solo lo básico (para componentes simples)
export const MINIMAL_IMPORTS = [
    CommonModule,
    RouterLink
] as const;