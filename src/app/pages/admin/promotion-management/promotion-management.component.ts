import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Promotion } from '../../../models/models';
import { PromotionService } from '../../../services/admin/promotion/promotion.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule, AbstractControl } from '@angular/forms';
import { ProductService } from '../../../services/admin/product/product.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { addDays } from 'date-fns';
import { PromotionDiagnosticService, OrphanedPromotionData } from './promotion-diagnostic/promotion-diagnostic.service';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzResultModule } from 'ng-zorro-antd/result';
import { from, Observable } from 'rxjs';

@Component({
  selector: 'app-promotion-management',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, NzTableModule, NzButtonModule,
    NzFormModule, NzInputModule, NzInputNumberModule, NzSelectModule,
    NzDatePickerModule, NzSwitchModule, NzCardModule, NzModalModule, NzTagModule,
    NzIconModule, NzToolTipModule, NzPopconfirmModule, NzSpinModule, NzEmptyModule,
    NzDividerModule, NzRadioModule, NzAlertModule, NzResultModule
  ],
  templateUrl: './promotion-management.component.html',
  styleUrls: ['./promotion-management.component.css']
})
export class PromotionManagementComponent implements OnInit {
  promotions: Promotion[] = [];
  categories: Category[] = [];
  products: { id: string, name: string }[] = [];
  loading = false;
  submitting = false;
  formModalVisible = false;
  isEditMode = false;
  selectedPromotion: Promotion | null = null;
  diagnosticData: OrphanedPromotionData | null = null;
  diagnosticModalVisible = false;
  diagnosing = false;
  orphanedVariantsData: any = null;
  cleanupModalVisible = false;
  cleaning = false;
  promotionForm!: FormGroup;

  couponTypes = [
    { label: 'Envío Gratis', value: 'SHIPPING' },
    { label: 'Referido (un uso)', value: 'REFERRAL' },
    { label: 'Bienvenida (un uso)', value: 'WELCOME' },
    { label: 'Estacional (múltiples usos)', value: 'SEASONAL' },
    { label: 'VIP (múltiples usos)', value: 'VIP' },
    { label: 'Por Compra Mínima', value: 'BULK' }
  ];

  constructor(
    private promotionService: PromotionService,
    private productService: ProductService,
    private categoryService: CategoryService,
    private message: NzMessageService,
    private modal: NzModalService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private promotionDiagnosticService: PromotionDiagnosticService,
    private notification: NzNotificationService
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadPromotions();
    this.loadCategories();
    this.loadProducts();
  }

  initForm(): void {
    this.promotionForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(5)]],
      description: [''],
      promotionType: ['standard', [Validators.required]],
      discountType: ['percentage', [Validators.required]],
      discountValue: [10, [Validators.required, Validators.min(0)]],
      startDate: [new Date(), [Validators.required]],
      endDate: [addDays(new Date(), 30), [Validators.required]],
      isActive: [true],
      maxDiscountAmount: [null, [Validators.min(0)]],
      minPurchaseAmount: [null, [Validators.min(0)]],
      applicableProductIds: [[]],
      applicableCategories: [[]],
      couponCode: [{ value: '', disabled: true }, [Validators.required, Validators.minLength(4), this.couponCodeValidator]],
      couponType: [{ value: null, disabled: true }],
      usageLimits: this.fb.group({
        global: [{ value: null, disabled: true }, [Validators.min(1)]],
        perUser: [{ value: null, disabled: true }, [Validators.min(1)]]
      })
    });

    this.promotionForm.get('promotionType')?.valueChanges.subscribe(type => {
      this.toggleCouponFields(type === 'coupon');
    });

    this.promotionForm.get('discountType')?.valueChanges.subscribe(type => {
      this.handleDiscountTypeChange(type as string);
    });
  }

  private toggleCouponFields(enable: boolean): void {
    const fields = ['couponCode', 'couponType', 'usageLimits'];
    fields.forEach(fieldName => {
      const control = this.promotionForm.get(fieldName);
      if (control) {
        if (enable) {
          control.enable();
        } else {
          control.disable();
          control.reset();
        }
      }
    });
  }

  private handleDiscountTypeChange(type: string): void {
    const discountValueControl = this.promotionForm.get('discountValue');
    if (type === 'shipping') {
      discountValueControl?.setValue(0);
      discountValueControl?.disable();
    } else {
      discountValueControl?.enable();
    }
  }

  loadPromotions(): void {
    this.loading = true;
    this.promotionService.forceRefreshPromotions().subscribe({
      next: (result) => {
        this.promotions = result;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.message.error('Error al cargar promociones');
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadCategories(): void {
    this.categoryService.getCategories().subscribe({
        next: (categories) => this.categories = categories,
        error: (error) => console.error('Error al cargar categorías:', error)
    });
  }

  loadProducts(): void {
    this.productService.getProducts().subscribe({
        next: (products) => {
            this.products = products.map(p => ({ id: p.id, name: p.name }));
        },
        error: (error) => console.error('Error al cargar productos:', error)
    });
  }

  openCreatePromotionModal(): void {
    this.isEditMode = false;
    this.selectedPromotion = null;
    this.promotionForm.reset({
      promotionType: 'standard',
      discountType: 'percentage',
      discountValue: 10,
      startDate: new Date(),
      endDate: addDays(new Date(), 30),
      isActive: true,
      applicableProductIds: [],
      applicableCategories: []
    });
    this.toggleCouponFields(false);
    this.formModalVisible = true;
  }

  openEditPromotionModal(promotion: Promotion): void {
    this.isEditMode = true;
    this.selectedPromotion = promotion;
    this.promotionForm.patchValue({
      ...promotion,
      startDate: promotion.startDate instanceof Date ? promotion.startDate : new Date(promotion.startDate),
      endDate: promotion.endDate instanceof Date ? promotion.endDate : new Date(promotion.endDate),
    });
    this.toggleCouponFields(promotion.promotionType === 'coupon');
    this.handleDiscountTypeChange(promotion.discountType);
    this.formModalVisible = true;
  }

  submitForm(): void {
    if (this.promotionForm.invalid) {
      Object.values(this.promotionForm.controls).forEach(control => {
        if (control instanceof FormGroup) {
          Object.values(control.controls).forEach(innerControl => {
            innerControl.markAsDirty();
            innerControl.updateValueAndValidity();
          });
        } else {
          control.markAsDirty();
          control.updateValueAndValidity();
        }
      });
      this.message.warning('Por favor, complete todos los campos requeridos correctamente.');
      return;
    }

    this.submitting = true;
    const formValue = this.promotionForm.getRawValue();

    // ✅ SOLUCIÓN AL ERROR DE FIREBASE:
    // Creamos un objeto limpio y eliminamos cualquier propiedad que sea `undefined`
    // antes de enviarla a Firebase.
    const promotionData: Partial<Promotion> = {
      ...formValue,
      startDate: formValue.startDate instanceof Date ? formValue.startDate : new Date(formValue.startDate),
      endDate: formValue.endDate instanceof Date ? formValue.endDate : new Date(formValue.endDate),
    };

    // Limpiamos el objeto de claves 'undefined'
    Object.keys(promotionData).forEach(key => {
        const typedKey = key as keyof typeof promotionData;
        if (promotionData[typedKey] === undefined) {
            delete promotionData[typedKey];
        }
    });

    // Si no es un cupón, nos aseguramos de que los campos de cupón no existan
    if (promotionData.promotionType !== 'coupon') {
        delete promotionData.couponCode;
        delete promotionData.couponType;
        delete promotionData.usageLimits;
    }


    const operation$: Observable<void | string> = this.isEditMode && this.selectedPromotion
      ? this.promotionService.updatePromotion(this.selectedPromotion.id, promotionData)
      : this.promotionService.createPromotion(promotionData as Promotion);

    operation$.subscribe({
      next: () => {
        this.message.success(`Promoción ${this.isEditMode ? 'actualizada' : 'creada'} correctamente.`);
        this.closeFormModal();
        this.loadPromotions();
      },
      error: (error: any) => {
        console.error(`Error al ${this.isEditMode ? 'actualizar' : 'crear'} la promoción:`, error);
        this.message.error(`Error al ${this.isEditMode ? 'actualizar' : 'crear'} la promoción.`);
        this.submitting = false;
        this.cdr.detectChanges();
      },
      complete: () => {
        this.submitting = false;
        this.cdr.detectChanges();
      }
    });
  }

  deletePromotion(id: string): void {
    this.modal.confirm({
      nzTitle: '¿Está seguro de eliminar esta promoción?',
      nzContent: 'Esta acción no se puede deshacer y se desaplicará de cualquier producto que la tenga.',
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.loading = true;
        this.promotionService.deletePromotion(id).subscribe({
            next: () => {
                this.message.success('Promoción eliminada correctamente.');
                this.loadPromotions();
            },
            error: (error: any) => {
                console.error('Error al eliminar la promoción:', error);
                this.message.error('Error al eliminar la promoción.');
                this.loading = false;
                this.cdr.detectChanges();
            }
        });
      }
    });
  }

  closeFormModal(): void {
    this.formModalVisible = false;
    this.submitting = false;
  }

  disabledStartDate = (startValue: Date): boolean => {
    if (!startValue) return false;
    return startValue.getTime() < Date.now() - 8.64e7;
  };

  disabledEndDate = (endValue: Date): boolean => {
    if (!endValue) return false;
    const startDate = this.promotionForm.get('startDate')?.value;
    return !!startDate && endValue.getTime() <= startDate.getTime();
  };

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const dateObj = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    if (isNaN(dateObj.getTime())) return 'Fecha inválida';
    return new Intl.DateTimeFormat('es-EC').format(dateObj);
  }

  formatDiscountValue(promotion: Promotion): string {
    if (promotion.discountType === 'shipping') return 'Envío Gratis';
    return promotion.discountType === 'percentage'
      ? `${promotion.discountValue}%`
      : `$${promotion.discountValue.toFixed(2)}`;
  }

  couponCodeValidator(control: AbstractControl): { [key: string]: any } | null {
    if (control.value && !/^[A-Z0-9]+$/.test(control.value)) {
      return { 'pattern': true };
    }
    return null;
  }

  getCategoryNames(categoryIds: string[]): string {
    if (!categoryIds || !categoryIds.length) return 'Todas';
    return categoryIds.map(id => this.categories.find(c => c.id === id)?.name || id).join(', ');
  }

  getProductNames(productIds: string[]): string {
    if (!productIds || !productIds.length) return 'Todos';
    return productIds.map(id => this.products.find(p => p.id === id)?.name || id).join(', ');
  }

  formatDiscountType(type: string): string {
    return type === 'percentage' ? 'Porcentaje' : 'Monto fijo';
  }

  runPromotionDiagnostic(): void {
    this.diagnosing = true;
    this.cdr.detectChanges();
    this.promotionDiagnosticService.diagnoseBrokenPromotions().subscribe({
      next: (diagnosticData) => {
        this.diagnosticData = diagnosticData;
        this.diagnosticModalVisible = true;
        this.diagnosing = false;
        const { stats } = diagnosticData;
        if (stats.totalOrphanedRecords > 0) {
          this.message.warning(`⚠️ Se encontraron ${stats.totalOrphanedRecords} registros problemáticos.`);
        } else {
          this.message.success('✅ No se encontraron problemas en las promociones.');
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.message.error('Error al ejecutar diagnóstico: ' + error.message);
        this.diagnosing = false;
        this.cdr.detectChanges();
      }
    });
  }

  getCleanupPreview(): { actionsToTake: string[]; estimatedDeletions: number; estimatedUpdates: number; } | null {
    if (!this.diagnosticData) return null;
    return this.promotionDiagnosticService.previewCleanup(this.diagnosticData);
  }

  closeDiagnosticModal(): void {
    this.diagnosticModalVisible = false;
    this.diagnosticData = null;
  }

  getSeverityColor(count: number): string {
    if (count === 0) return 'success';
    if (count <= 5) return 'warning';
    return 'error';
  }

  formatCleanupActions(): string[] {
    const preview = this.getCleanupPreview();
    return preview ? preview.actionsToTake : [];
  }

  diagnoseOrphanedVariants(): void {
    this.diagnosing = true;
    this.cdr.detectChanges();
    from(this.promotionDiagnosticService.diagnoseOrphanedVariants()).subscribe({
      next: (data) => {
        this.orphanedVariantsData = data;
        this.cleanupModalVisible = true;
        this.diagnosing = false;
        if (data.totalOrphans > 0) {
          this.message.warning(`⚠️ Se encontraron ${data.totalOrphans} variantes con promociones inexistentes`);
        } else {
          this.message.success('✅ No se encontraron variantes huérfanas');
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.message.error('Error al diagnosticar variantes: ' + error.message);
        this.diagnosing = false;
        this.cdr.detectChanges();
      }
    });
  }

  executeCleanup(): void {
    if (!this.orphanedVariantsData || this.orphanedVariantsData.totalOrphans === 0) {
      this.message.info('No hay variantes para limpiar');
      return;
    }
    this.modal.confirm({
      nzTitle: '🧹 ¿Confirmar Limpieza?',
      nzContent: `<p>Esta acción limpiará <strong>${this.orphanedVariantsData.totalOrphans} variantes</strong>.</p><p style="color: #d32f2f;"><strong>⚠️ Esta acción no se puede deshacer.</strong></p>`,
      nzOkText: 'Limpiar Variantes',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzWidth: 500,
      nzOnOk: () => {
        this.cleaning = true;
        this.cdr.detectChanges();
        from(this.promotionDiagnosticService.cleanOrphanedVariants(this.orphanedVariantsData.orphanedVariants)).subscribe({
          next: (result) => {
            this.cleaning = false;
            if (result.errors.length > 0) {
              this.message.warning(`Limpieza completada con errores: ${result.cleanedCount} limpiadas, ${result.errors.length} errores`);
            } else {
              this.message.success(`✅ Limpieza exitosa: ${result.cleanedCount} variantes limpiadas`);
            }
            this.closeCleanupModal();
            this.loadPromotions();
            this.cdr.detectChanges();
          },
          error: (error) => {
            this.message.error('Error durante la limpieza: ' + error.message);
            this.cleaning = false;
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  closeCleanupModal(): void {
    this.cleanupModalVisible = false;
    this.orphanedVariantsData = null;
  }
}
