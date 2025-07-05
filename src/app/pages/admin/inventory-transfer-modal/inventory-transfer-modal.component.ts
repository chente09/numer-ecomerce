// src/app/pages/admin/components/inventory-transfer-modal/inventory-transfer-modal.component.ts
import { Component, OnInit, Input, Output, EventEmitter, inject, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NzModalRef, NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message'; // Aseguramos que NzMessageModule esté aquí para la importación
import { Observable, of, forkJoin } from 'rxjs';
import { catchError, filter, map, switchMap, take, tap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

// ✅ Tus importaciones exactas, confirmadas que funcionan en tu entorno
import { ProductVariant } from '../../../models/models';
import { DistributorService, TransferDetails, DistributorInventoryItem } from '../../../services/admin/distributor/distributor.service';
import { ProductInventoryService } from '../../../services/admin/inventario/product-inventory.service';
import { UsersService, UserProfile } from '../../../services/users/users.service';// Usaremos UsersService para obtener el UID del usuario
import { ProductService } from '../../../services/admin/product/product.service';


// Importaciones de Ng-Zorro adicionales necesarias para el HTML
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTypographyModule } from 'ng-zorro-antd/typography';


@Component({
  selector: 'app-inventory-transfer-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzModalModule,
    NzFormModule,
    NzSelectModule,
    NzInputNumberModule,
    NzButtonModule,
    NzInputModule,
    NzIconModule,
    NzTypographyModule
  ],
  templateUrl: './inventory-transfer-modal.component.html',
  styleUrls: ['./inventory-transfer-modal.component.css'] // ✅ Corregido a 'styleUrls' (plural)
})
export class InventoryTransferModalComponent implements OnInit {

  @Output() transferSuccess = new EventEmitter<void>();

  productId?: string;
  variantId?: string;

  transferForm!: FormGroup;
  variants$: Observable<ProductVariant[]> = of([]);
  distributors$: Observable<UserProfile[]> = of([]);
  selectedVariant: ProductVariant | undefined;
  currentAdminUid: string | null = null;
  isLoading = false;

  private fb = inject(FormBuilder);
  private distributorService = inject(DistributorService);
  private productInventoryService = inject(ProductInventoryService);
  private usersService = inject(UsersService);
  private productService = inject(ProductService);
  private modalRef = inject(NzModalRef);
  private message = inject(NzMessageService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    // ✅ Obtener datos desde los component params inyectados
    this.productId = this.modalRef.getConfig().nzData?.['productId'];
    this.variantId = this.modalRef.getConfig().nzData?.['variantId'];

    console.log('🚀 InventoryTransferModal - ngOnInit iniciado', {
      productId: this.productId,
      variantId: this.variantId
    });

    this.transferForm = this.fb.group({
      variant: [this.variantId, [Validators.required]], // Pre-seleccionar si viene
      distributor: [null, [Validators.required]],
      quantity: [1, [Validators.required, Validators.min(1)]],
      notes: ['']
    });

    // Si la variante ya está seleccionada, cárgala
    if (this.variantId) {
      this.onVariantSelected(this.variantId);
    }

    this.transferForm.get('variant')?.valueChanges.subscribe(variantId => {
      if (variantId) {
        this.onVariantSelected(variantId);
      }
    });

    this.usersService.user$.pipe(
      filter(user => !!user),
      take(1),
      map(user => user!.uid)
    ).subscribe(uid => {
      this.currentAdminUid = uid;
      this.cdr.markForCheck();
    });

    this.loadInitialData();
  }


  loadInitialData(): void {
    console.log('📊 Cargando datos iniciales...');
    this.isLoading = true;

    // ✅ FORZAR DETECCIÓN antes de cargar
    this.cdr.detectChanges();

    this.distributors$ = this.distributorService.getDistributors().pipe(
      tap((distributors) => {
        console.log('📋 Distribuidores cargados:', distributors.length);
        // ✅ FORZAR DETECCIÓN después de cargar distribuidores
        this.cdr.detectChanges();
      }),
      catchError(error => {
        this.message.error('Error al cargar distribuidores.');
        console.error('Error cargando distribuidores:', error);
        return of([]);
      })
    );

    if (this.productId) {
      this.variants$ = this.productInventoryService.getVariantsByProductId(this.productId).pipe(
        tap((variants) => {
          console.log('🧬 Variantes cargadas:', variants.length);
          // ✅ FORZAR DETECCIÓN después de cargar variantes
          this.cdr.detectChanges();
        }),
        catchError(error => {
          this.message.error('Error al cargar variantes del producto.');
          console.error('Error cargando variantes:', error);
          return of([]);
        })
      );
    } else {
      this.variants$ = this.productService.getProducts().pipe(
        map(products => products.flatMap(p => p.variants || [])),
        tap((variants) => {
          console.log('🧬 Todas las variantes cargadas:', variants.length);
          // ✅ FORZAR DETECCIÓN después de cargar todas las variantes
          this.cdr.detectChanges();
        }),
        catchError(error => {
          this.message.error('Error al cargar todas las variantes.');
          console.error('Error cargando todas las variantes:', error);
          return of([]);
        })
      );
    }

    if (this.variantId) {
      this.productInventoryService.getVariantById(this.variantId).pipe(
        take(1),
        filter(variant => !!variant)
      ).subscribe(variant => {
        console.log('🎯 Variante específica cargada:', variant);
        this.selectedVariant = variant;
        this.transferForm.patchValue({ variant: variant?.id });
        this.updateQuantityValidators(variant?.stock || 0);
        this.isLoading = false;

        // ✅ FORZAR DETECCIÓN después de cargar variante específica
        this.cdr.detectChanges();
      });
    } else {
      this.isLoading = false;
      // ✅ FORZAR DETECCIÓN al finalizar carga
      this.cdr.detectChanges();
    }
  }

  onVariantSelected(variantId: string): void {
    this.productInventoryService.getVariantById(variantId).pipe(
      take(1)
    ).subscribe(variant => {
      this.selectedVariant = variant;
      this.updateQuantityValidators(variant?.stock || 0);
    });
  }

  updateQuantityValidators(maxStock: number): void {
    const quantityControl = this.transferForm.get('quantity');
    if (quantityControl) {
      quantityControl.setValidators([
        Validators.required,
        Validators.min(1),
        Validators.max(maxStock)
      ]);
      quantityControl.updateValueAndValidity();
    }
  }

  submitForm(): void {
    if (this.transferForm.invalid) {
      Object.values(this.transferForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }
    if (!this.currentAdminUid) {
      this.message.error('No se pudo determinar el usuario administrador. Refresque la página.');
      return;
    }

    this.isLoading = true;
    const { variant, distributor, quantity, notes } = this.transferForm.value;

    const transferDetails: TransferDetails = {
      distributorId: distributor,
      variantId: variant,
      quantity: quantity,
      productId: this.selectedVariant!.productId,
      performedByUid: this.currentAdminUid,
      notes: notes
    };

    this.distributorService.transferStockToDistributor(transferDetails).subscribe({
      next: () => {
        // No necesitas emitir aquí si el padre lo maneja desde la referencia
        this.modalRef.close(true); // Cerrar el modal y pasar un resultado 'true'
      },
      error: (err) => {
        this.message.error(`Error en la transferencia: ${err.message || 'Error desconocido'}`);
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  cancel(): void {
    this.modalRef.destroy();
  }

  formatVariantLabel(variant: ProductVariant): string {
    return `${variant.colorName} - ${variant.sizeName} (SKU: ${variant.sku}) - Stock: ${variant.stock}`;
  }

  formatDistributorLabel(distributor: UserProfile): string {
    return `${distributor.displayName || distributor.email} (Email: ${distributor.email})`;
  }
}
