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
import { NzStepsModule } from 'ng-zorro-antd/steps';

@Component({
  selector: 'app-promotion-management',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, NzTableModule, NzButtonModule,
    NzFormModule, NzInputModule, NzInputNumberModule, NzSelectModule,
    NzDatePickerModule, NzSwitchModule, NzCardModule, NzModalModule, NzTagModule,
    NzIconModule, NzToolTipModule, NzPopconfirmModule, NzSpinModule, NzEmptyModule,
    NzDividerModule, NzRadioModule, NzAlertModule, NzResultModule, NzStepsModule
  ],
  templateUrl: './promotion-management.component.html',
  styleUrls: ['./promotion-management.component.css']
})
export class PromotionManagementComponent implements OnInit {
  // --- Propiedades sin cambios ---
  promotions: Promotion[] = [];
  categories: Category[] = [];
  products: { id: string, name: string }[] = [];
  loading = true;
  submitting = false;
  formModalVisible = false;
  isEditMode = false;
  selectedPromotionId: string | null = null;

  // --- Propiedades Refactorizadas ---
  currentStep = 0; // 0: Seleccionar Tipo, 1: Configurar
  promotionForm!: FormGroup;

  constructor(
    private promotionService: PromotionService,
    private productService: ProductService,
    private categoryService: CategoryService,
    private message: NzMessageService,
    private modal: NzModalService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadPromotions();
  }

  loadInitialData(): void {
    this.loading = true;
    Promise.all([
      this.promotionService.forceRefreshPromotions().toPromise(),
      this.categoryService.getCategories().toPromise(),
      this.productService.getProducts().toPromise()
    ]).then(([promotions, categories, products]) => {
      this.promotions = promotions || [];
      this.categories = categories || [];
      this.products = products?.map(p => ({ id: p.id, name: p.name })) || [];
      this.loading = false;
      this.cdr.detectChanges();
    }).catch(error => {
      this.loading = false;
      this.message.error('Error al cargar datos iniciales.');
      console.error(error);
    });
  }

  initForm(): void {
    this.promotionForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      promotionType: ['standard', Validators.required],
      discountType: ['percentage', Validators.required],
      discountValue: [null, Validators.required],
      dates: [null, Validators.required],
      isActive: [true],
      // Campos de cupón, se validarán dinámicamente
      minPurchaseAmount: [null],
      maxDiscountAmount: [null],
      couponCode: [null],
      usageLimits: this.fb.group({
        global: [null],
        perUser: [null]
      })
    });

    this.promotionForm.get('promotionType')?.valueChanges.subscribe(type => {
      this.updateFormBasedOnType(type);
    });

    this.promotionForm.get('discountType')?.valueChanges.subscribe(type => {
      const discountValueCtrl = this.promotionForm.get('discountValue');
      if (type === 'shipping') {
        discountValueCtrl?.setValue(0);
        discountValueCtrl?.disable();
      } else {
        discountValueCtrl?.enable();
      }
    });
  }

  updateFormBasedOnType(type: 'standard' | 'coupon'): void {
    const couponCodeCtrl = this.promotionForm.get('couponCode');

    if (type === 'standard') {
      // Si es una promoción estándar, quitamos el validador de couponCode
      couponCodeCtrl?.clearValidators();
      // Reseteamos el tipo de descuento si era 'shipping'
      if (this.promotionForm.get('discountType')?.value === 'shipping') {
        this.promotionForm.get('discountType')?.setValue('percentage');
      }
    } else { // Es un cupón
      // Hacemos el campo couponCode requerido
      couponCodeCtrl?.setValidators(Validators.required);
    }
    couponCodeCtrl?.updateValueAndValidity();
  }

  toggleCouponValidators(isCoupon: boolean): void {
    const couponCode = this.promotionForm.get('couponCode');
    if (isCoupon) {
      couponCode?.setValidators([Validators.required, Validators.minLength(4), this.couponCodeValidator]);
    } else {
      couponCode?.clearValidators();
      couponCode?.reset();
    }
    couponCode?.updateValueAndValidity();
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
    this.selectedPromotionId = null;
    this.currentStep = 0;
    this.promotionForm.reset({
      name: '',
      description: '',
      promotionType: 'standard',
      discountType: 'percentage',
      discountValue: 10,
      dates: [new Date(), addDays(new Date(), 30)],
      isActive: true,
      minPurchaseAmount: null,
      maxDiscountAmount: null,
      applicableCategoryIds: [],
      applicableProductIds: [],
      couponCode: null,
      usageLimits: { global: null, perUser: null }
    });
    this.toggleCouponValidators(false);
    this.formModalVisible = true;
  }


  openEditPromotionModal(promotion: Promotion): void {
    this.isEditMode = true;
    this.selectedPromotionId = promotion.id;
    this.currentStep = 1; // Ir directo al formulario

    this.promotionForm.reset({
      name: promotion.name,
      description: promotion.description || '',
      promotionType: promotion.promotionType,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      dates: [new Date(promotion.startDate), new Date(promotion.endDate)],
      isActive: promotion.isActive,
      minPurchaseAmount: promotion.minPurchaseAmount || null,
      couponCode: promotion.couponCode || null,
      usageLimits: {
        global: promotion.usageLimits?.global || null,
        perUser: promotion.usageLimits?.perUser || null
      }
    });
    this.toggleCouponValidators(promotion.promotionType === 'coupon');
    this.formModalVisible = true;
  }

  submitForm(): void {
    if (this.promotionForm.invalid) {
      this.message.warning('Por favor, complete todos los campos requeridos.');
      return;
    }

    this.submitting = true;
    const formValue = this.promotionForm.getRawValue();
    const type = formValue.promotionType;

    // 1. Objeto base con los datos comunes
    const promotionData: Partial<Promotion> = {
      name: formValue.name,
      description: formValue.description || null,
      promotionType: type,
      discountType: formValue.discountType,
      discountValue: formValue.discountValue,
      startDate: formValue.dates[0],
      endDate: formValue.dates[1],
      isActive: formValue.isActive,
    };

    // 2. Añadir campos exclusivos para cupones
    if (type === 'coupon') {
      promotionData.couponCode = formValue.couponCode.toUpperCase();
      promotionData.minPurchaseAmount = formValue.minPurchaseAmount || null;
      promotionData.maxDiscountAmount = formValue.maxDiscountAmount || null; // ✅ <--- ESTA ES LA LÍNEA QUE FALTABA
      promotionData.usageLimits = {
        global: formValue.usageLimits.global || null,
        perUser: formValue.usageLimits.perUser || null,
      };
    }

    // 3. Limpieza de nulos y envío (sin cambios)
    Object.keys(promotionData).forEach(key => {
      const typedKey = key as keyof typeof promotionData;
      if (promotionData[typedKey] === null) {
        delete promotionData[typedKey];
      }
    });

    const operation$: Observable<any> = this.isEditMode && this.selectedPromotionId
      ? this.promotionService.updatePromotion(this.selectedPromotionId, promotionData)
      : this.promotionService.createPromotion(promotionData as Promotion);

    operation$.subscribe({
      next: () => {
        this.message.success(`Plantilla ${this.isEditMode ? 'actualizada' : 'creada'} con éxito.`);
        this.closeFormModal();
        this.loadInitialData();
      },
      error: (err) => {
        this.submitting = false;
        this.message.error('Ocurrió un error al guardar la plantilla.');
        console.error(err);
      },
      complete: () => this.submitting = false
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

  getSeverityColor(count: number): string {
    if (count === 0) return 'success';
    if (count <= 5) return 'warning';
    return 'error';
  }

  // Método para manejar la selección del tipo de promoción en el Paso 1
  selectPromotionType(type: 'standard' | 'coupon'): void {
    this.promotionForm.get('promotionType')?.setValue(type);
    this.currentStep = 1; // Avanzamos al siguiente paso
  }

  // Métodos para navegar entre los pasos (los usaremos en el pie del modal)
  prevStep(): void {
    this.currentStep--;
  }

  // Añade este método en promotion-management.component.ts
  isCurrentStepValid(): boolean {
    if (this.currentStep === 1) {
      // Valida los campos del paso 2
      const name = this.promotionForm.get('name');
      const discountType = this.promotionForm.get('discountType');
      const discountValue = this.promotionForm.get('discountValue');

      let isDiscountValueValid = true;
      if (discountType?.value !== 'shipping') {
        isDiscountValueValid = discountValue?.valid ?? false;
      }

      return !!(name?.valid && discountType?.valid && isDiscountValueValid);
    }
    return true; // Para los demás pasos, por ahora siempre es válido
  }
}
