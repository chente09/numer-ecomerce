// src/app/pages/admin/components/inventory-transfer-modal/inventory-transfer-modal.component.ts
import { Component, OnInit, Input, Output, EventEmitter, inject, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NzModalRef, NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Observable, of, forkJoin } from 'rxjs';
import { catchError, filter, finalize, map, switchMap, take, tap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

// Tus importaciones exactas
import { Product, ProductVariant } from '../../../models/models';
import { DistributorService, TransferDetails } from '../../../services/admin/distributor/distributor.service';
import { ProductInventoryService } from '../../../services/admin/inventario/product-inventory.service';
import { UsersService, UserProfile } from '../../../services/users/users.service';
import { ProductService } from '../../../services/admin/product/product.service';
import { DistributorLedgerService } from '../../../services/admin/distributorLedger/distributor-ledger.service';

// Módulos NG-Zorro
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzTagModule } from 'ng-zorro-antd/tag';

@Component({
  selector: 'app-inventory-transfer-modal',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, NzModalModule, NzFormModule, NzSelectModule,
    NzInputNumberModule, NzButtonModule, NzInputModule, NzIconModule, NzTypographyModule,
    NzSpinModule, NzAlertModule, NzTagModule
  ],
  templateUrl: './inventory-transfer-modal.component.html',
  styleUrls: ['./inventory-transfer-modal.component.css']
})
export class InventoryTransferModalComponent implements OnInit {

  @Input() product?: Product;
  @Input() variant?: ProductVariant;
  @Output() transferSuccess = new EventEmitter<void>();

  transferForm!: FormGroup;
  variants$: Observable<ProductVariant[]> = of([]);
  distributors$: Observable<UserProfile[]> = of([]);
  selectedVariant: ProductVariant | undefined;
  currentAdminUid: string | null = null;
  isLoading = false;
  isSubmitting = false;

  private readonly VAT_RATE = 0.15;
  private readonly DISTRIBUTOR_DISCOUNT_PERCENTAGE = 0.30;

  private fb = inject(FormBuilder);
  private distributorService = inject(DistributorService);
  private productInventoryService = inject(ProductInventoryService);
  private usersService = inject(UsersService);
  private productService = inject(ProductService);
  private modalRef = inject(NzModalRef);
  private message = inject(NzMessageService);
  private cdr = inject(ChangeDetectorRef);
  private ledgerService = inject(DistributorLedgerService);

  ngOnInit(): void {
    // 🔧 CORRECCIÓN: Obtener datos desde nzData del modal
    const modalData = this.modalRef.getConfig().nzData;

    console.log('🔍 Debug - Modal recibió datos:', modalData);

    if (modalData?.product) this.product = modalData.product;
    if (modalData?.variant) this.variant = modalData.variant;

    console.log('🔍 Debug - Datos asignados:', {
      product: this.product,
      variant: this.variant
    });

    this.initializeForm();
    this.loadDistributors();
    this.getCurrentAdmin();

    // 🔧 CORRECCIÓN: Solo cargar variantes si NO se pasó una variante específica
    if (!this.variant && this.product) {
      this.loadVariants();
    }
  }

  private initializeForm(): void {
    // 🔧 CORRECCIÓN: Inicializar formulario según si hay variante fija o no
    if (this.variant) {
      // ✅ VARIANTE FIJA: No incluir el campo variant en el formulario
      this.transferForm = this.fb.group({
        distributorId: [null, [Validators.required]],
        quantity: [1, [Validators.required, Validators.min(1), Validators.max(this.variant.stock || 0)]],
        notes: ['']
      });

      this.selectedVariant = this.variant;
    } else {
      // ⚠️ MODO SELECTOR: Incluir el campo variant (fallback)
      this.transferForm = this.fb.group({
        variant: [null, [Validators.required]],
        distributorId: [null, [Validators.required]],
        quantity: [1, [Validators.required, Validators.min(1)]],
        notes: ['']
      });

      // Escuchar cambios en la selección de variante
      this.transferForm.get('variant')?.valueChanges.subscribe(variantId => {
        if (variantId) this.onVariantSelected(variantId);
      });
    }
  }

  private loadVariants(): void {
    if (!this.product?.id) return;

    this.isLoading = true;
    this.variants$ = this.productService.getProductVariants(this.product.id).pipe(
      map(variants => variants.filter(v => (v.stock || 0) > 0)),
      finalize(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      })
    );
  }

  private loadDistributors(): void {
    this.distributors$ = this.distributorService.getDistributors().pipe(
      catchError(error => {
        console.error('Error cargando distribuidores:', error);
        this.message.error('Error al cargar distribuidores');
        return of([]);
      })
    );
  }

  private getCurrentAdmin(): void {
    this.usersService.user$.pipe(
      filter(user => !!user && !user.isAnonymous),
      take(1)
    ).subscribe(user => {
      this.currentAdminUid = user!.uid;
    });
  }

  private onVariantSelected(variantId: string): void {
    this.variants$.pipe(take(1)).subscribe(variants => {
      this.selectedVariant = variants.find(v => v.id === variantId);
      if (this.selectedVariant) {
        this.updateQuantityValidators(this.selectedVariant.stock || 0);
      }
    });
  }

  private updateQuantityValidators(maxStock: number): void {
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
          control.updateValueAndValidity({ onlySelf: false });
        }
      });
      this.message.warning('Por favor, complete todos los campos requeridos.');
      return;
    }

    if (!this.selectedVariant) {
      this.message.error('No se pudo determinar la variante a transferir.');
      return;
    }

    this.isSubmitting = true;
    const { distributorId, quantity, notes } = this.transferForm.value;

    const transferDetails: TransferDetails = {
      distributorId: distributorId,
      variantId: this.selectedVariant.id,
      productId: this.product!.id,
      quantity,
      performedByUid: this.currentAdminUid!,
      notes: notes || `Transferencia de ${quantity} x ${this.product!.name}`
    };

    this.distributorService.transferStockToDistributor(transferDetails).subscribe({
      next: async () => {
        try {
          // Calcular el costo base y el total de la deuda
          const distributorCostBase = this.calculateDistributorCost();
          const totalWithoutIVA = distributorCostBase * quantity;
          const totalDebitAmount = totalWithoutIVA * (1 + this.VAT_RATE);

          // ✅ CAMBIO CLAVE: Redondear el monto total de la deuda a 2 decimales.
          const roundedTotalDebitAmount = Math.round(totalDebitAmount * 100) / 100;

          const transferId = `transfer-${Date.now()}`;

          // Registrar el débito en el libro contable
          await this.ledgerService.registerDebit(
            distributorId,
            roundedTotalDebitAmount, // ✅ USAR EL VALOR YA REDONDEADO
            `Transferencia de ${quantity} x ${this.product!.name} (${this.selectedVariant!.colorName}/${this.selectedVariant!.sizeName}) - Costo: $${distributorCostBase.toFixed(2)} + IVA`,
            transferId,
            'transfer'
          );

          this.message.success(`Stock transferido y deuda registrada: $${roundedTotalDebitAmount.toFixed(2)}`);
          this.modalRef.close({ success: true });

        } catch (ledgerError: any) {
          this.message.error(`Stock transferido, pero falló el registro de la deuda: ${ledgerError.message}.`);
          this.modalRef.close({ success: true, warning: 'ledger_failed' });
        }
      },
      error: (err) => {
        this.message.error(`Error al transferir el stock: ${err.message}`);
      },
      complete: () => {
        this.isSubmitting = false;
      }
    });
  }

  // ✅ NUEVO: Método para calcular el costo del distribuidor correctamente
  private calculateDistributorCost(): number {
    // 1️⃣ PRIORIDAD: distributorCost específico de la variante
    if (this.selectedVariant!.distributorCost && this.selectedVariant!.distributorCost > 0) {
      return this.selectedVariant!.distributorCost;
    }

    // 2️⃣ PRIORIDAD: distributorCost del producto
    if (this.product!.distributorCost && this.product!.distributorCost > 0) {
      return this.product!.distributorCost;
    }

    // 3️⃣ FALLBACK: Cálculo tradicional con descuentos
    const price = this.selectedVariant!.price || this.product!.price;
    const priceWithoutVAT = price / (1 + this.VAT_RATE);
    return priceWithoutVAT * (1 - this.DISTRIBUTOR_DISCOUNT_PERCENTAGE);
  }

  // ✅ NUEVO: Método auxiliar para verificar si hay distributorCost directo
  public getDistributorCostDirect(): number | null {
    return this.selectedVariant!.distributorCost || this.product!.distributorCost || null;
  }

  // ✅ NUEVO: Método para mostrar información de precios en el template
  getCalculatedCostInfo(): string {
    if (!this.selectedVariant) return '';

    const distributorCost = this.calculateDistributorCost();
    const hasDirectCost = this.getDistributorCostDirect() !== null;
    const quantity = this.transferForm.get('quantity')?.value || 1;
    const totalWithoutIVA = distributorCost * quantity;
    const totalWithIVA = totalWithoutIVA * (1 + this.VAT_RATE);

    if (hasDirectCost) {
      return `Costo distribuidor: $${distributorCost.toFixed(2)} x ${quantity} = $${totalWithoutIVA.toFixed(2)} + IVA (15%) = $${totalWithIVA.toFixed(2)}`;
    } else {
      return `Costo calculado (fallback): $${distributorCost.toFixed(2)} x ${quantity} = $${totalWithoutIVA.toFixed(2)} + IVA (15%) = $${totalWithIVA.toFixed(2)}`;
    }
  }

  destroyModal(): void {
    this.modalRef.destroy();
  }

  formatVariantLabel(variant: ProductVariant): string {
    return `${variant.colorName} - ${variant.sizeName} (SKU: ${variant.sku}) - Stock: ${variant.stock}`;
  }

  formatDistributorLabel(distributor: UserProfile): string {
    return `${distributor.displayName || distributor.email}`;
  }

  // 🆕 MÉTODOS AUXILIARES PARA EL TEMPLATE

  getProductInfoDescription(): string {
    if (!this.product) return '';

    if (this.variant) {
      return `Producto: ${this.product.name} | Variante: ${this.variant.colorName}/${this.variant.sizeName} | Stock disponible: ${this.variant.stock}`;
    } else {
      return `Producto: ${this.product.name} | Seleccione una variante para continuar`;
    }
  }

  getQuantityErrorTip(): string {
    const quantityControl = this.transferForm.get('quantity');

    if (quantityControl?.hasError('required')) {
      return 'La cantidad es requerida.';
    }
    if (quantityControl?.hasError('min')) {
      return 'La cantidad debe ser al menos 1.';
    }
    if (quantityControl?.hasError('max')) {
      return `Stock insuficiente. Disponible: ${this.selectedVariant?.stock || 0}`;
    }

    return 'Cantidad inválida.';
  }
}