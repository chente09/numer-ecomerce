import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Promotion } from '../../../models/models';
import { PromotionService } from '../../../services/admin/promotion/promotion.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ProductService } from '../../../services/admin/product/product.service';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { addDays } from 'date-fns';

// Importación de todos los módulos de NG-ZORRO necesarios
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

@Component({
  selector: 'app-promotion-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    NzTableModule,
    NzButtonModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzSelectModule,
    NzDatePickerModule,
    NzSwitchModule,
    NzCardModule,
    NzModalModule,
    NzTagModule,
    NzIconModule,
    NzToolTipModule,
    NzPopconfirmModule,
    NzSpinModule,
    NzEmptyModule,
    NzDividerModule,
    NzRadioModule
  ],
  templateUrl: './promotion-management.component.html',
  styleUrl: './promotion-management.component.css'
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
  
  // Formulario para crear/editar promociones
  promotionForm!: FormGroup;
  
  // Opciones para el formulario
  discountTypes = [
    { label: 'Porcentaje (%)', value: 'percentage' },
    { label: 'Monto fijo ($)', value: 'fixed' }
  ];
  
  // Filtros y paginación
  totalPromotions = 0;
  pageSize = 10;
  pageIndex = 1;
  
  constructor(
    private promotionService: PromotionService,
    private productService: ProductService,
    private categoryService: CategoryService,
    private message: NzMessageService,
    private modal: NzModalService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) { }
  
  ngOnInit(): void {
    this.initForm();
    this.loadPromotions();
    this.loadCategories();
    this.loadProducts();
  }
  
  initForm(): void {
    this.promotionForm = this.fb.group({
      name: ['', [Validators.required]],
      description: [''],
      discountType: ['percentage', [Validators.required]],
      discountValue: [10, [Validators.required, Validators.min(0)]],
      startDate: [new Date(), [Validators.required]],
      endDate: [addDays(new Date(), 30), [Validators.required]],
      isActive: [true],
      maxDiscountAmount: [null, [Validators.min(0)]],
      applicableProductIds: [[]],
      applicableCategories: [[]],
      minPurchaseAmount: [null, [Validators.min(0)]]
    });
  }
  
  loadPromotions(): void {
    this.loading = true;
    this.cdr.detectChanges();
    
    this.promotionService.getPromotions()
      .subscribe({
        next: (result) => {
          this.promotions = result;
          this.totalPromotions = result.length;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error al cargar promociones:', error);
          this.message.error('Error al cargar promociones');
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }
  
  loadCategories(): void {
    this.categoryService.getCategories()
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error al cargar categorías:', error);
        }
      });
  }
  
  loadProducts(): void {
    this.productService.getProducts()
      .subscribe({
        next: (products) => {
          this.products = products.map(p => ({ id: p.id, name: p.name }));
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error al cargar productos:', error);
        }
      });
  }
  
  openCreatePromotionModal(): void {
    this.isEditMode = false;
    this.selectedPromotion = null;
    this.promotionForm.reset({
      discountType: 'percentage',
      discountValue: 10,
      startDate: new Date(),
      endDate: addDays(new Date(), 30),
      isActive: true,
      applicableProductIds: [],
      applicableCategories: []
    });
    this.formModalVisible = true;
  }
  
  openEditPromotionModal(promotion: Promotion): void {
    this.isEditMode = true;
    this.selectedPromotion = promotion;
    
    // Populate form with promotion data
    this.promotionForm.patchValue({
      name: promotion.name,
      description: promotion.description || '',
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      startDate: promotion.startDate instanceof Date ? promotion.startDate : new Date(promotion.startDate),
      endDate: promotion.endDate instanceof Date ? promotion.endDate : new Date(promotion.endDate),
      isActive: promotion.isActive,
      maxDiscountAmount: promotion.maxDiscountAmount || null,
      applicableProductIds: promotion.applicableProductIds || [],
      applicableCategories: promotion.applicableCategories || [],
      minPurchaseAmount: promotion.minPurchaseAmount || null
    });
    
    this.formModalVisible = true;
  }
  
  deletePromotion(id: string): void {
    this.modal.confirm({
      nzTitle: '¿Está seguro de eliminar esta promoción?',
      nzContent: 'Esta acción no se puede deshacer.',
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.loading = true;
        this.cdr.detectChanges();
        
        this.promotionService.deletePromotion(id)
          .subscribe({
            next: () => {
              this.message.success('Promoción eliminada correctamente');
              this.loadPromotions();
            },
            error: (error) => {
              console.error('Error al eliminar promoción:', error);
              this.message.error('Error al eliminar promoción');
              this.loading = false;
              this.cdr.detectChanges();
            }
          });
      }
    });
  }
  
  submitForm(): void {
    if (this.promotionForm.invalid) {
      // Marcar todos los campos como touched para mostrar errores
      Object.values(this.promotionForm.controls).forEach(control => {
        control.markAsDirty();
        control.updateValueAndValidity();
      });
      
      this.message.warning('Por favor complete todos los campos requeridos correctamente');
      return;
    }
    
    this.submitting = true;
    this.cdr.detectChanges();
    
    const formData = this.promotionForm.value;
    
    // Asegurarse de que las fechas son objetos Date
    const promotionData: Partial<Promotion> = {
      ...formData,
      startDate: formData.startDate instanceof Date ? formData.startDate : new Date(formData.startDate),
      endDate: formData.endDate instanceof Date ? formData.endDate : new Date(formData.endDate)
    };
    
    if (this.isEditMode && this.selectedPromotion) {
      // Actualizar promoción existente
      this.promotionService.updatePromotion(this.selectedPromotion.id, promotionData)
        .subscribe({
          next: () => {
            this.message.success('Promoción actualizada correctamente');
            this.closeFormModal();
            this.loadPromotions();
          },
          error: (error) => {
            console.error('Error al actualizar promoción:', error);
            this.message.error('Error al actualizar promoción');
            this.submitting = false;
            this.cdr.detectChanges();
          },
          complete: () => {
            this.submitting = false;
            this.cdr.detectChanges();
          }
        });
    } else {
      // Crear nueva promoción
      this.promotionService.createPromotion(promotionData as Promotion)
        .subscribe({
          next: () => {
            this.message.success('Promoción creada correctamente');
            this.closeFormModal();
            this.loadPromotions();
          },
          error: (error) => {
            console.error('Error al crear promoción:', error);
            this.message.error('Error al crear promoción');
            this.submitting = false;
            this.cdr.detectChanges();
          },
          complete: () => {
            this.submitting = false;
            this.cdr.detectChanges();
          }
        });
    }
  }
  
  closeFormModal(): void {
    this.formModalVisible = false;
    this.isEditMode = false;
    this.selectedPromotion = null;
    this.submitting = false;
  }
  
  disabledStartDate = (startValue: Date): boolean => {
    if (!startValue) {
      return false;
    }
    return startValue.getTime() < Date.now() - 8.64e7; // No permitir fechas anteriores al día actual
  };
  
  disabledEndDate = (endValue: Date): boolean => {
    if (!endValue) {
      return false;
    }
    const startDate = this.promotionForm.get('startDate')?.value;
    if (!startDate) {
      return false;
    }
    return endValue.getTime() <= startDate.getTime();
  };
  
  formatDate(date: any): string {
  try {
    // Si no hay fecha, retornar un valor por defecto
    if (!date) {
      return 'Fecha no disponible';
    }
    
    // Convertir a objeto Date si aún no lo es
    let dateObj: Date;
    
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      // Intentar convertir desde string
      dateObj = new Date(date);
    } else if (typeof date === 'number') {
      // Intentar convertir desde timestamp (milisegundos)
      dateObj = new Date(date);
    } else if (typeof date === 'object' && date.seconds) {
      // Manejar fechas de Firestore específicamente
      // Las fechas de Firestore a menudo tienen un formato {seconds: number, nanoseconds: number}
      dateObj = new Date(date.seconds * 1000);
    } else {
      // Si no se puede determinar el formato, devolver un mensaje
      return 'Formato de fecha no válido';
    }
    
    // Verificar si la conversión resultó en una fecha válida
    if (isNaN(dateObj.getTime())) {
      return 'Fecha no válida';
    }
    
    // Formatear la fecha utilizando Intl.DateTimeFormat
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(dateObj);
  } catch (error) {
    console.error('Error al formatear fecha:', error, 'Valor recibido:', date);
    return 'Error en fecha';
  }
}
  
  getCategoryNames(categoryIds: string[]): string {
    if (!categoryIds || !categoryIds.length) return 'Todas';
    
    return categoryIds.map(id => {
      const category = this.categories.find(c => c.id === id);
      return category ? category.name : id;
    }).join(', ');
  }
  
  getProductNames(productIds: string[]): string {
    if (!productIds || !productIds.length) return 'Todos';
    
    return productIds.map(id => {
      const product = this.products.find(p => p.id === id);
      return product ? product.name : id;
    }).join(', ');
  }
  
  formatDiscountType(type: string): string {
    return type === 'percentage' ? 'Porcentaje' : 'Monto fijo';
  }
  
  formatDiscountValue(promotion: Promotion): string {
    return promotion.discountType === 'percentage'
      ? `${promotion.discountValue}%`
      : `$${promotion.discountValue.toFixed(2)}`;
  }
}