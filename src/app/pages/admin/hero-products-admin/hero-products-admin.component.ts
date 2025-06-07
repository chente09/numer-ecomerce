import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

import { HeroProductsService, CustomHeroItem, ProductBasicInfo } from '../../../services/admin/heroProducts/hero-products.service';

@Component({
  selector: 'app-hero-products-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzModalModule,
    NzTableModule,
    NzFormModule,
    NzInputModule,
    NzCardModule,
    NzUploadModule,
    NzIconModule,
    NzPopconfirmModule,
    NzAvatarModule,
    NzToolTipModule,
    NzEmptyModule,
    NzSkeletonModule,
    NzSwitchModule,
    NzInputNumberModule,
    NzTagModule,
    NzDividerModule,
    NzStatisticModule,
    NzBadgeModule,
    NzSelectModule
  ],
  templateUrl: './hero-products-admin.component.html',
  styleUrls: ['./hero-products-admin.component.css']
})
export class HeroProductsAdminComponent implements OnInit, OnDestroy {
  // 🎯 ESTADOS PRINCIPALES SIMPLIFICADOS
  heroItems: CustomHeroItem[] = [];
  availableProducts: ProductBasicInfo[] = [];
  
  // 🎯 LOADING STATES ESPECÍFICOS
  isInitialLoading = true;  // Solo para carga inicial
  isSaving = false;         // Solo para guardar/actualizar
  isDeleting: Set<string> = new Set(); // Para múltiples eliminaciones
  
  // 🎯 MODAL STATES
  isModalVisible = false;
  isEditMode = false;
  editingId: string | null = null;
  
  // 🎯 FORM Y UPLOAD
  heroForm!: FormGroup;
  uploadFile: File | null = null;
  fileList: NzUploadFile[] = [];
  
  // 🎯 UI HELPERS
  fallbackImageUrl!: SafeUrl; // ✅ Definite assignment assertion
  modalWidth = 600;
  selectedItem: CustomHeroItem | null = null;
  showDetailsModal = false;
  
  private destroy$ = new Subject<void>();

  constructor(
    private heroProductsService: HeroProductsService,
    private message: NzMessageService,
    private modalService: NzModalService,
    private sanitizer: DomSanitizer,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeFallbackImage();
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadInitialData();
    this.updateModalWidth();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 🎯 INICIALIZACIÓN SIMPLIFICADA
  private initializeFallbackImage(): void {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="100" height="100" fill="#f5f5f5"/>
      <text x="50%" y="50%" font-size="12" text-anchor="middle" 
            alignment-baseline="middle" fill="#999">Sin imagen</text>
    </svg>`;
    this.fallbackImageUrl = this.sanitizer.bypassSecurityTrustUrl(
      'data:image/svg+xml;base64,' + btoa(svg)
    );
  }

  private initializeForm(): void {
    this.heroForm = this.fb.group({
      productId: ['', Validators.required],
      title: ['', Validators.required],
      subtitle: [''],
      ctaText: ['Ver Producto', Validators.required],
      isActive: [true],
      order: [1, [Validators.required, Validators.min(1)]]
    });
  }

  // 🎯 CARGA DE DATOS OPTIMIZADA
  private loadInitialData(): void {
    this.isInitialLoading = true;
    
    // ✅ MEJORADO: Usar forkJoin más simple
    forkJoin({
      heroItems: this.heroProductsService.getHeroItems(),
      products: this.heroProductsService.getAvailableProducts()
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isInitialLoading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: ({ heroItems, products }) => {
        this.heroItems = heroItems || [];
        this.availableProducts = products || [];
      },
      error: (error) => {
        console.error('Error cargando datos:', error);
        this.message.error('Error al cargar los datos');
      }
    });
  }

  // 🎯 REFRESH SIMPLE SIN LOADING GLOBAL
  refreshData(): void {
    this.loadInitialData();
  }

  // 🎯 MODAL MANAGEMENT SIMPLIFICADO
  openCreateModal(): void {
    this.resetModal();
    this.isModalVisible = true;
    this.heroForm.patchValue({
      ctaText: 'Ver Producto',
      isActive: true,
      order: this.getNextOrder(),
      subtitle: ''
    });
  }

  openEditModal(item: CustomHeroItem): void {
    this.resetModal();
    this.isEditMode = true;
    this.editingId = item.id;
    this.isModalVisible = true;
    
    this.heroForm.patchValue({
      productId: item.productId,
      title: item.title,
      subtitle: item.subtitle || '',
      ctaText: item.ctaText,
      isActive: item.isActive,
      order: item.order
    });

    // Mostrar imagen actual si existe
    if (item.customImageUrl) {
      this.fileList = [{
        uid: '-1',
        name: 'current-image.jpg',
        status: 'done',
        url: item.customImageUrl
      }];
    }
  }

  closeModal(): void {
    this.isModalVisible = false;
    this.resetModal();
  }

  private resetModal(): void {
    this.isEditMode = false;
    this.editingId = null;
    this.isSaving = false;
    this.uploadFile = null;
    this.fileList = [];
    this.heroForm.reset();
  }

  // 🎯 UPLOAD SIMPLIFICADO
  beforeUpload = (file: NzUploadFile): boolean => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 3 * 1024 * 1024; // 3MB

    if (!validTypes.includes(file.type!)) {
      this.message.error('Solo se permiten archivos JPG, PNG o WEBP');
      return false;
    }

    if (file.size! > maxSize) {
      this.message.error('El archivo debe ser menor a 3MB');
      return false;
    }

    this.uploadFile = file as any;
    this.createFilePreview(file as any);
    return false; // Prevenir upload automático
  };

  private createFilePreview(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.fileList = [{
        uid: file.name,
        name: file.name,
        status: 'done',
        url: reader.result as string
      }];
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  removeFile = (): boolean => {
    this.uploadFile = null;
    this.fileList = [];
    return true;
  };

  // 🎯 SUBMIT OPTIMIZADO
  async submitForm(): Promise<void> {
    if (!this.heroForm.valid) {
      this.markFormGroupTouched();
      return;
    }

    if (!this.uploadFile && !this.isEditMode) {
      this.message.error('Debe seleccionar una imagen');
      return;
    }

    this.isSaving = true;
    
    try {
      const formData = this.heroForm.value;

      if (this.isEditMode && this.editingId) {
        await this.heroProductsService.updateHeroItem(
          this.editingId,
          formData,
          this.uploadFile || undefined
        );
        this.message.success('Hero item actualizado');
      } else {
        await this.heroProductsService.createHeroItem(formData, this.uploadFile!);
        this.message.success('Hero item creado');
      }

      this.closeModal();
      this.refreshData();

    } catch (error: any) {
      console.error('Error:', error);
      this.message.error(error.message || 'Error al procesar');
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.heroForm.controls).forEach(key => {
      this.heroForm.get(key)?.markAsTouched();
    });
  }

  // 🎯 ACTIONS OPTIMIZADAS
  async deleteItem(id: string): Promise<void> {
    this.isDeleting.add(id);
    
    try {
      await this.heroProductsService.deleteHeroItem(id);
      this.message.success('Hero item eliminado');
      this.refreshData();
    } catch (error: any) {
      console.error('Error:', error);
      this.message.error('Error al eliminar');
    } finally {
      this.isDeleting.delete(id);
      this.cdr.markForCheck();
    }
  }

  async toggleActive(item: CustomHeroItem): Promise<void> {
    try {
      const newState = !item.isActive;
      await this.heroProductsService.toggleHeroItem(item.id, newState);
      
      // Update local state immediately
      item.isActive = newState;
      this.message.success(`Hero item ${newState ? 'activado' : 'desactivado'}`);
      
    } catch (error: any) {
      console.error('Error:', error);
      this.message.error('Error al cambiar estado');
      // Revert local change on error
      item.isActive = !item.isActive;
    } finally {
      this.cdr.markForCheck();
    }
  }

  async updateOrder(): Promise<void> {
    try {
      const orderedIds = this.heroItems
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(item => item.id);

      await this.heroProductsService.updateItemsOrder(orderedIds);
      this.message.success('Orden actualizado');
    } catch (error: any) {
      console.error('Error:', error);
      this.message.error('Error al actualizar orden');
    }
  }

  // 🎯 HELPERS SIMPLIFICADOS
  @HostListener('window:resize')
  updateModalWidth(): void {
    this.modalWidth = window.innerWidth < 576 ? window.innerWidth - 32 : 600;
  }

  getNextOrder(): number {
    return Math.max(...this.heroItems.map(item => item.order || 0), 0) + 1;
  }

  getProductName(productId: string): string {
    return this.availableProducts.find(p => p.id === productId)?.name || 'Producto no encontrado';
  }

  getProductPrice(productId: string): number {
    return this.availableProducts.find(p => p.id === productId)?.price || 0;
  }

  hasHeroItem(productId: string): boolean {
    return this.heroItems.some(item => item.productId === productId);
  }

  onProductChange(productId: string): void {
    if (!this.isEditMode) {
      const product = this.availableProducts.find(p => p.id === productId);
      if (product && !this.heroForm.get('title')?.value) {
        this.heroForm.patchValue({ title: product.name });
      }
    }
  }

  getStats() {
    const total = this.heroItems.length;
    const active = this.heroItems.filter(item => item.isActive).length;
    return { total, active, inactive: total - active };
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && !img.src.includes('data:image')) {
      img.src = this.fallbackImageUrl as string;
    }
  }

  showDetails(item: CustomHeroItem): void {
    this.selectedItem = item;
    this.showDetailsModal = true;
  }

  // 🎯 VALIDATION HELPERS
  isFieldInvalid(fieldName: string): boolean {
    const field = this.heroForm.get(fieldName);
    return !!(field?.invalid && field?.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.heroForm.get(fieldName);
    if (field?.errors && field?.touched) {
      if (field.errors['required']) return `${fieldName} es requerido`;
      if (field.errors['min']) return `Valor mínimo: ${field.errors['min'].min}`;
    }
    return '';
  }

  isProductAlreadyUsed(productId: string): boolean {
    return !this.isEditMode && this.hasHeroItem(productId);
  }

  canSubmit(): boolean {
    const hasImage = this.uploadFile || this.isEditMode;
    return this.heroForm.valid && hasImage && !this.isSaving;
  }
}