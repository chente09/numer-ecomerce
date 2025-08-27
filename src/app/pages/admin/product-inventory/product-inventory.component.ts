// src/app/pages/admin/product-inventory/product-inventory.component.ts
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../services/admin/product/product.service';
import { PromotionService } from '../../../services/admin/promotion/promotion.service';
import { ProductInventoryService, StockUpdate } from '../../../services/admin/inventario/product-inventory.service';
import { Product, ProductVariant, Color, Promotion } from '../../../models/models';
import { NzMessageService } from 'ng-zorro-antd/message';
import { finalize, switchMap, throwError } from 'rxjs';

// Importar módulos ng-zorro necesarios
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzModalModule, NzModalService, NzModalRef } from 'ng-zorro-antd/modal';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { ProductPriceService } from '../../../services/admin/price/product-price.service';
import { StockUpdateService } from '../../../services/admin/stockUpdate/stock-update.service';
import { PromotionStateService } from '../../../services/admin/promotionState/promotion-state.service';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { InventoryTransferModalComponent } from '../inventory-transfer-modal/inventory-transfer-modal.component';// 🆕 Importar el nuevo modal
import { DistributorLedgerService } from '../../../services/admin/distributorLedger/distributor-ledger.service';

// 🚀 Interfaces para filtros y selección
interface FilterOption {
  value: string;
  label: string;
  count: number;
  color?: string;
}

// 🚀 Interfaces para el backup y control de estado
interface VariantBackup {
  originalVariant: ProductVariant;
  index: number;
}

interface OptimisticOperation {
  type: 'promotion' | 'deletion' | 'stock';
  variantId: string;
  backup?: VariantBackup;
}

type QuickFilterType = 'all' | 'problems' | 'low_stock' | 'promotions' | 'no_stock';
type StockStatusType = 'no_stock' | 'critical' | 'low' | 'normal';
type PromotionFilterType = 'all' | 'with' | 'without';
type SortType = 'stock_desc' | 'stock_asc' | 'color_name' | 'size_name' | 'sku' | 'promotion_status';


@Component({
  selector: 'app-product-inventory',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzTableModule,
    NzInputModule,
    NzInputNumberModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzPopconfirmModule,
    NzToolTipModule,
    NzSpinModule,
    NzEmptyModule,
    NzDividerModule,
    NzModalModule,
    NzAvatarModule,
    NzCardModule,
    NzPopoverModule,
    NzSelectModule,
    NzCheckboxModule,
    NzRadioModule,
    NzGridModule
  ],
  templateUrl: './product-inventory.component.html',
  styleUrls: ['./product-inventory.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductInventoryComponent implements OnInit, OnChanges, OnDestroy {
  @Input() product: Product | null = null;


  @Output() productUpdated = new EventEmitter<{
    productId: string;
    updatedProduct: Product;
  }>();

  variants: ProductVariant[] = [];
  loading = false;
  editingVariantId: string | null = null;
  editingStock: number = 0;
  promotions: Promotion[] = [];
  selectedVariantForPromotion: ProductVariant | null = null;
  promotionModalVisible = false;



  // 🚀 Control de operaciones optimistas
  private pendingOperations = new Map<string, OptimisticOperation>();
  private readonly COMPONENT_NAME = 'ProductInventoryComponent';

  // ==================== 🆕 NUEVAS PROPIEDADES PARA FILTROS ====================

  // Variantes filtradas (resultado de aplicar filtros)
  filteredVariants: ProductVariant[] = [];

  // Estado de filtros
  filtersExpanded = false;
  quickFilter: QuickFilterType = 'all';
  searchTerm = '';
  selectedColors: string[] = [];
  selectedSizes: string[] = [];
  selectedStockStatus: StockStatusType[] = [];
  stockRange = { min: null as number | null, max: null as number | null };
  promotionFilter: PromotionFilterType = 'all';
  sortBy: SortType = 'stock_desc';

  // Opciones disponibles para filtros
  availableColors: FilterOption[] = [];
  availableSizes: FilterOption[] = [];

  // Selección múltiple
  selectedVariantIds: string[] = [];
  selectAll = false;
  indeterminate = false;

  // Modales para acciones masivas
  bulkStockModalVisible = false;
  bulkPromotionModalVisible = false;
  bulkStockOperation: 'set' | 'add' | 'subtract' = 'set';
  bulkStockValue: number | null = null;

  // 🆕 NUEVAS PROPIEDADES para responsividad
  isMobile = false;
  isTablet = false;
  private searchTimeout: any;

  constructor(
    private productService: ProductService,
    private inventoryService: ProductInventoryService,
    private stockUpdateService: StockUpdateService,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef,
    private promotionService: PromotionService,
    private productPriceService: ProductPriceService,
    private promotionStateService: PromotionStateService,
    private zone: NgZone,
    private ledgerService: DistributorLedgerService
  ) {
    // 🆕 DETECTAR TAMAÑO DE PANTALLA
    this.checkScreenSize();
  }

  ngOnInit(): void {
    this.promotionStateService.registerComponent(this.COMPONENT_NAME);
    if (this.product) {
      this.loadVariants();
      this.loadPromotions();
    }
  }

  ngOnDestroy(): void {
    this.promotionStateService.unregisterComponent(this.COMPONENT_NAME);
    this.cleanupMobileResources();

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  // 🆕 DETECTAR TAMAÑO DE PANTALLA
  @HostListener('window:resize', ['$event'])
  private checkScreenSize(): void {
    const width = window.innerWidth;
    this.isMobile = width <= 768;
    this.isTablet = width > 768 && width <= 1024;
    this.cdr.markForCheck(); // ✅ Usar markForCheck en lugar de detectChanges
  }

  // 🆕 OBTENER CONFIGURACIÓN DE PAGINACIÓN RESPONSIVA
  getPageSize(): number {
    if (this.isMobile) return 5;
    if (this.isTablet) return 8;
    return 10;
  }

  // 🆕 OBTENER CONFIGURACIÓN DE MAX TAGS RESPONSIVA
  getMaxTagCount(): number {
    if (this.isMobile) return 1;
    if (this.isTablet) return 1;
    return 2;
  }

  // 🆕 OBTENER ALTURA DE SCROLL PARA MODALES
  getModalScrollHeight(): string {
    if (this.isMobile) return '200px';
    if (this.isTablet) return '250px';
    return '300px';
  }

  // 🆕 OBTENER ANCHO DE MODAL RESPONSIVO
  getModalWidth(): number {
    if (this.isMobile) return 320;
    if (this.isTablet) return 500;
    return 600;
  }

  // 🆕 OBTENER CONFIGURACIÓN DE GUTTER RESPONSIVO
  getGutter(): [number, number] {
    if (this.isMobile) return [4, 4];
    if (this.isTablet) return [8, 8];
    return [12, 12];
  }

  // 🆕 TEXTO ABREVIADO PARA MÓVILES
  getButtonText(fullText: string, shortText: string): string {
    return this.isMobile ? shortText : fullText;
  }



  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] && changes['product'].currentValue && this.product) {
      this.loadVariants();
      // ✅ REINICIALIZAR filtros cuando cambia el producto
      this.clearAllFilters();
    }
  }

  loadVariants(): void {
    if (!this.product) return;

    this.loading = true;
    this.cdr.detectChanges();

    this.productService.getProductVariants(this.product.id)
      .pipe(
        finalize(() => {
          this.zone.run(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        })
      )
      .subscribe({
        next: (variants) => {
          this.zone.run(() => {
            this.variants = variants.map(variant => ({
              ...variant,
              checked: false
            }));

            // 🆕 INICIALIZAR FILTROS Y OPCIONES
            this.initializeFilterOptions();
            this.applyFilters();

            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('Error al cargar variantes:', error);
            this.message.error('Error al cargar variantes: ' + (error.message || 'Error desconocido'));
            this.cdr.detectChanges();
          });
        }
      });
  }

  // ==================== 🆕 MÉTODOS DE FILTROS ====================

  /**
   * Inicializa las opciones disponibles para los filtros
   */
  private initializeFilterOptions(): void {
    if (!this.product) return;

    // Generar opciones de colores con conteos
    const colorCounts = new Map<string, number>();
    this.variants.forEach(variant => {
      const count = colorCounts.get(variant.colorName) || 0;
      colorCounts.set(variant.colorName, count + 1);
    });

    this.availableColors = this.product.colors.map(color => ({
      value: color.name,
      label: color.name,
      count: colorCounts.get(color.name) || 0,
      color: color.code
    })).filter(option => option.count > 0);

    // Generar opciones de tallas con conteos
    const sizeCounts = new Map<string, number>();
    this.variants.forEach(variant => {
      const count = sizeCounts.get(variant.sizeName) || 0;
      sizeCounts.set(variant.sizeName, count + 1);
    });

    this.availableSizes = this.product.sizes.map(size => ({
      value: size.name,
      label: size.name,
      count: sizeCounts.get(size.name) || 0
    })).filter(option => option.count > 0);
  }

  /**
   * Aplica todos los filtros activos
   */
  private applyFilters(): void {
    let filtered = [...this.variants];

    // Aplicar filtro rápido
    filtered = this.applyQuickFilter(filtered, this.quickFilter);

    // Aplicar búsqueda
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(variant =>
        variant.colorName.toLowerCase().includes(term) ||
        variant.sizeName.toLowerCase().includes(term) ||
        variant.sku.toLowerCase().includes(term)
      );
    }

    // Aplicar filtros de color
    if (this.selectedColors.length > 0) {
      filtered = filtered.filter(variant =>
        this.selectedColors.includes(variant.colorName)
      );
    }

    // Aplicar filtros de talla
    if (this.selectedSizes.length > 0) {
      filtered = filtered.filter(variant =>
        this.selectedSizes.includes(variant.sizeName)
      );
    }

    // Aplicar filtros de estado de stock
    if (this.selectedStockStatus.length > 0) {
      filtered = filtered.filter(variant => {
        const status = this.getVariantStockStatus(variant.stock || 0);
        return this.selectedStockStatus.includes(status);
      });
    }

    // Aplicar rango de stock
    if (this.stockRange.min !== null || this.stockRange.max !== null) {
      filtered = filtered.filter(variant => {
        const stock = variant.stock || 0;
        if (this.stockRange.min !== null && stock < this.stockRange.min) return false;
        if (this.stockRange.max !== null && stock > this.stockRange.max) return false;
        return true;
      });
    }

    // Aplicar filtros de promoción
    if (this.promotionFilter !== 'all') {
      filtered = filtered.filter(variant => {
        const hasPromotion = Boolean(variant.promotionId);
        return this.promotionFilter === 'with' ? hasPromotion : !hasPromotion;
      });
    }

    // Aplicar ordenamiento
    filtered = this.applySorting(filtered, this.sortBy);

    this.filteredVariants = filtered;

    // 🆕 AGREGAR: Asegurar que todas las variantes tengan la propiedad checked
    this.filteredVariants.forEach(variant => {
      if (variant.checked === undefined) {
        variant.checked = false;
      }
    });

    // Actualizar estado de selección
    this.updateSelectionState();
  }

  /**
   * Aplica filtro rápido
   */
  private applyQuickFilter(variants: ProductVariant[], filter: QuickFilterType): ProductVariant[] {
    switch (filter) {
      case 'problems':
        return variants.filter(variant =>
          (variant.stock || 0) <= 3 || !variant.imageUrl
        );
      case 'low_stock':
        return variants.filter(variant =>
          (variant.stock || 0) > 0 && (variant.stock || 0) <= 10
        );
      case 'promotions':
        return variants.filter(variant => Boolean(variant.promotionId));
      case 'no_stock':
        return variants.filter(variant => (variant.stock || 0) === 0);
      case 'all':
      default:
        return variants;
    }
  }

  /**
   * Aplica ordenamiento
   */
  private applySorting(variants: ProductVariant[], sortBy: SortType): ProductVariant[] {
    return [...variants].sort((a, b) => {
      switch (sortBy) {
        case 'stock_desc':
          return (b.stock || 0) - (a.stock || 0);
        case 'stock_asc':
          return (a.stock || 0) - (b.stock || 0);
        case 'color_name':
          return a.colorName.localeCompare(b.colorName);
        case 'size_name':
          return a.sizeName.localeCompare(b.sizeName);
        case 'sku':
          return a.sku.localeCompare(b.sku);
        case 'promotion_status':
          const aHasPromo = Boolean(a.promotionId) ? 1 : 0;
          const bHasPromo = Boolean(b.promotionId) ? 1 : 0;
          return bHasPromo - aHasPromo;
        default:
          return 0;
      }
    });
  }

  /**
   * Obtiene el estado de stock de una variante
   */
  private getVariantStockStatus(stock: number): StockStatusType {
    if (stock === 0) return 'no_stock';
    if (stock <= 3) return 'critical';
    if (stock <= 10) return 'low';
    return 'normal';
  }

  // ==================== 🆕 EVENTOS DE FILTROS ====================

  toggleFiltersExpanded(): void {
    this.filtersExpanded = !this.filtersExpanded;

    // En móviles, cerrar automáticamente después de 10 segundos si no hay actividad
    if (this.isMobile && this.filtersExpanded) {
      setTimeout(() => {
        if (this.filtersExpanded) {
          this.filtersExpanded = false;
          this.cdr.detectChanges();
        }
      }, 10000);
    }

    this.cdr.markForCheck();
  }

  setQuickFilter(filter: QuickFilterType): void {
    this.quickFilter = filter;
    this.clearDetailedFilters();
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onSearchChange(term: string): void {
    // Limpiar timeout anterior
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // En móviles, agregar debounce de 300ms para mejor performance
    const delay = this.isMobile ? 300 : 150;

    this.searchTimeout = setTimeout(() => {
      this.searchTerm = term;
      this.applyFilters();
      this.cdr.markForCheck();
    }, delay);
  }

  // 🆕 MÉTODO AUXILIAR para mostrar/ocultar columnas en móvil
  shouldShowColumn(column: string): boolean {
    if (!this.isMobile) return true;

    // En móvil, ocultar algunas columnas menos importantes
    const hiddenOnMobile = ['actions-secondary'];
    return !hiddenOnMobile.includes(column);
  }

  // 🆕 OBTENER CLASE CSS RESPONSIVA PARA ELEMENTOS
  getResponsiveClass(baseClass: string): string {
    let classes = [baseClass];

    if (this.isMobile) classes.push(`${baseClass}--mobile`);
    if (this.isTablet) classes.push(`${baseClass}--tablet`);

    return classes.join(' ');
  }

  // 🆕 CONFIGURACIÓN RESPONSIVA PARA LA TABLA
  getTableScroll(): { x?: string, y?: string } {
    if (this.isMobile) {
      return { x: '500px', y: '400px' };
    }
    if (this.isTablet) {
      return { x: '600px', y: '500px' };
    }
    return { x: '800px' };
  }

  onColorFilterChange(colors: string[]): void {
    this.selectedColors = colors;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onSizeFilterChange(sizes: string[]): void {
    this.selectedSizes = sizes;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onStockStatusChange(statuses: StockStatusType[]): void {
    this.selectedStockStatus = statuses;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onStockRangeChange(): void {
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onPromotionFilterChange(filter: PromotionFilterType): void {
    this.promotionFilter = filter;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onSortChange(sortBy: SortType): void {
    this.sortBy = sortBy;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  clearAllFilters(): void {
    this.quickFilter = 'all';
    this.clearDetailedFilters();
    this.applyFilters();
    this.cdr.markForCheck();
  }

  private clearDetailedFilters(): void {
    this.searchTerm = '';
    this.selectedColors = [];
    this.selectedSizes = [];
    this.selectedStockStatus = [];
    this.stockRange = { min: null, max: null };
    this.promotionFilter = 'all';
  }

  hasActiveFilters(): boolean {
    return this.quickFilter !== 'all' ||
      this.searchTerm.trim() !== '' ||
      this.selectedColors.length > 0 ||
      this.selectedSizes.length > 0 ||
      this.selectedStockStatus.length > 0 ||
      this.stockRange.min !== null ||
      this.stockRange.max !== null ||
      this.promotionFilter !== 'all';
  }

  // ==================== 🆕 MÉTODOS DE CONTEO ====================

  getProblemsCount(): number {
    return this.variants.filter(variant =>
      (variant.stock || 0) <= 3 || !variant.imageUrl
    ).length;
  }

  getLowStockCount(): number {
    return this.variants.filter(variant =>
      (variant.stock || 0) > 0 && (variant.stock || 0) <= 10
    ).length;
  }

  getPromotionsCount(): number {
    return this.variants.filter(variant => Boolean(variant.promotionId)).length;
  }

  getNoStockCount(): number {
    return this.variants.filter(variant => (variant.stock || 0) === 0).length;
  }

  // ==================== 🆕 SELECCIÓN MÚLTIPLE ====================

  onSelectAllChange(checked: boolean): void {
    this.selectAll = checked;
    this.indeterminate = false;

    this.filteredVariants.forEach(variant => {
      variant.checked = checked;
    });

    this.updateSelectedIds();

    // En móvil, mostrar feedback visual adicional
    if (this.isMobile && checked) {
      this.message.info(`${this.filteredVariants.length} variantes seleccionadas`, {
        nzDuration: 2000
      });
    }

    this.cdr.markForCheck();
  }

  private cleanupMobileResources(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
  }

  onVariantSelectChange(variant: ProductVariant, checked: boolean): void {
    variant.checked = checked;
    this.updateSelectionState();
    this.updateSelectedIds();
    this.cdr.markForCheck();
  }

  private updateSelectionState(): void {
    const checkedCount = this.filteredVariants.filter(v => v.checked).length;
    const totalCount = this.filteredVariants.length;

    this.selectAll = checkedCount === totalCount && totalCount > 0;
    this.indeterminate = checkedCount > 0 && checkedCount < totalCount;
  }

  private updateSelectedIds(): void {
    this.selectedVariantIds = this.filteredVariants
      .filter(variant => variant.checked)
      .map(variant => variant.id);
  }

  clearSelection(): void {
    this.filteredVariants.forEach(variant => {
      variant.checked = false;
    });
    this.selectedVariantIds = [];
    this.selectAll = false;
    this.indeterminate = false;
    this.cdr.markForCheck();
  }

  // ==================== 🆕 ACCIONES MASIVAS ====================

  bulkUpdateStock(): void {
    if (this.selectedVariantIds.length === 0) {
      this.message.warning('Seleccione al menos una variante');
      return;
    }

    this.bulkStockOperation = 'set';
    this.bulkStockValue = null;
    this.bulkStockModalVisible = true;

    // En móvil, hacer scroll al inicio del modal
    if (this.isMobile) {
      setTimeout(() => {
        const modal = document.querySelector('.ant-modal-body');
        if (modal) {
          modal.scrollTop = 0;
        }
      }, 100);
    }

    this.cdr.markForCheck();
  }

  bulkApplyPromotion(): void {
    if (this.selectedVariantIds.length === 0) {
      this.message.warning('Seleccione al menos una variante');
      return;
    }

    this.loadPromotions();
    this.bulkPromotionModalVisible = true;
    this.cdr.markForCheck();
  }

  bulkDeleteVariants(): void {
    if (this.selectedVariantIds.length === 0) {
      this.message.warning('Seleccione al menos una variante');
      return;
    }

    this.modal.confirm({
      nzTitle: '¿Eliminar variantes seleccionadas?',
      nzContent: `¿Está seguro de eliminar ${this.selectedVariantIds.length} variante(s) seleccionada(s)?`,
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        this.executeBulkDelete();
      }
    });
  }

  private executeBulkDelete(): void {
    const selectedVariants = this.filteredVariants.filter(v => v.checked);
    let deletedCount = 0;

    this.loading = true;
    this.cdr.detectChanges();

    // Eliminar variantes una por una
    selectedVariants.forEach(variant => {
      this.inventoryService.deleteVariant(variant.id).subscribe({
        next: () => {
          deletedCount++;

          // Remover de la lista local
          this.variants = this.variants.filter(v => v.id !== variant.id);

          if (deletedCount === selectedVariants.length) {
            this.loading = false;
            this.clearSelection();
            this.applyFilters();
            this.message.success(`${deletedCount} variante(s) eliminada(s) correctamente`);
            this.cdr.detectChanges();
          }
        },
        error: (error) => {
          this.loading = false;
          this.message.error(`Error al eliminar variante ${variant.sku}: ${error.message}`);
          this.cdr.detectChanges();
        }
      });
    });
  }

  confirmBulkStockUpdate(): void {
    if (this.bulkStockValue === null || this.bulkStockValue === undefined) {
      this.message.warning('Ingrese un valor válido');
      return;
    }

    const selectedVariants = this.filteredVariants.filter(v => v.checked);
    this.loading = true;
    this.closeBulkStockModal();

    selectedVariants.forEach(variant => {
      let newStock = 0;

      switch (this.bulkStockOperation) {
        case 'set':
          newStock = this.bulkStockValue!;
          break;
        case 'add':
          newStock = (variant.stock || 0) + this.bulkStockValue!;
          break;
        case 'subtract':
          newStock = Math.max(0, (variant.stock || 0) - this.bulkStockValue!);
          break;
      }

      const stockChange = newStock - (variant.stock || 0);


      if (stockChange !== 0) {
        const update: StockUpdate = {
          productId: this.product!.id,
          variantId: variant.id,
          quantity: stockChange
        };

        this.inventoryService.updateStock(update).subscribe({
          next: () => {
            variant.stock = newStock;
            this.applyFilters();
            this.cdr.detectChanges();
          },
          error: (error) => {
            this.message.error(`Error actualizando ${variant.sku}: ${error.message}`);
          }
        });
      }
    });

    this.loading = false;
    this.clearSelection();
    this.message.success('Stock actualizado masivamente');
    this.cdr.detectChanges();
  }

  confirmBulkPromotionApplication(promotionId: string): void {
    const selectedVariants = this.filteredVariants.filter(v => v.checked);

    this.promotionService.getPromotionById(promotionId).subscribe({
      next: (promotion) => {
        if (!promotion) {
          this.message.error('Promoción no encontrada');
          return;
        }

        this.loading = true;
        this.closeBulkPromotionModal();

        selectedVariants.forEach(variant => {
          this.productPriceService.applyPromotionToVariant(
            this.product!.id,
            variant.id,
            promotion,
            this.product!.price
          ).subscribe({
            next: () => {
              // Actualizar variante local
              variant.promotionId = promotion.id;
              variant.discountType = promotion.discountType;
              variant.discountValue = promotion.discountValue;

              this.applyFilters();
              this.cdr.detectChanges();
            },
            error: (error) => {
              this.message.error(`Error aplicando promoción a ${variant.sku}: ${error.message}`);
            }
          });
        });

        this.loading = false;
        this.clearSelection();
        this.message.success('Promoción aplicada masivamente');
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.message.error('Error cargando promoción: ' + error.message);
      }
    });
  }

  closeBulkStockModal(): void {
    this.bulkStockModalVisible = false;
    this.bulkStockValue = null;
    this.cdr.markForCheck();
  }

  closeBulkPromotionModal(): void {
    this.bulkPromotionModalVisible = false;
    this.cdr.markForCheck();
  }

  getColorByName(colorName: string): Color | undefined {
    if (!this.product || !colorName) return undefined;
    return this.product.colors?.find(c => c.name === colorName);
  }

  startEditStock(variant: ProductVariant): void {
    this.editingVariantId = variant.id;
    this.editingStock = variant.stock || 0;
    this.cdr.markForCheck();
  }

  saveStock(variant: ProductVariant): void {
    if (this.editingStock < 0) {
      this.message.error('La cantidad de stock no puede ser negativa');
      return;
    }

    const currentStock = variant.stock || 0;
    const stockChange = this.editingStock - currentStock;


    if (stockChange === 0) {
      this.cancelEdit();
      return;
    }

    // 🚀 ACTUALIZACIÓN OPTIMISTA LOCAL INMEDIATA
    const oldTotalStock = this.product?.totalStock || 0;
    const newTotalStock = Math.max(0, oldTotalStock + stockChange);

    // Actualizar variante local inmediatamente
    variant.stock = this.editingStock;
    this.editingVariantId = null;

    // Actualizar producto local
    if (this.product) {
      this.product = {
        ...this.product,
        totalStock: newTotalStock
      };

      // 🚀 NOTIFICAR CAMBIO DE STOCK A TODO EL SISTEMA
      this.stockUpdateService.notifyStockChange({
        productId: this.product.id,
        variantId: variant.id,
        stockChange: stockChange,
        newStock: this.editingStock,
        timestamp: new Date(),
        source: 'admin',
        metadata: {
          colorName: variant.colorName,
          sizeName: variant.sizeName,
          productName: this.product.name,
          userAction: 'manual_update'
        }
      });

      // 🚀 EMITIR EVENTO AL COMPONENTE PADRE INMEDIATAMENTE
      this.productUpdated.emit({
        productId: this.product.id,
        updatedProduct: this.product
      });
    }

    // Mostrar éxito inmediatamente
    this.message.success('Stock actualizado correctamente');
    this.applyFilters();
    this.cdr.detectChanges();

    // Procesar en servidor en segundo plano
    this.loading = true;

    const update: StockUpdate = {
      productId: this.product!.id,
      variantId: variant.id,
      quantity: stockChange
    };

    this.inventoryService.updateStock(update)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          console.log('✅ [INVENTORY] Actualización confirmada en servidor');
          // La UI ya está actualizada optimísticamente
        },
        error: (error) => {
          console.error('❌ [INVENTORY] Error en servidor, haciendo rollback:', error);

          // 🔄 ROLLBACK: Revertir cambios
          variant.stock = currentStock;

          if (this.product) {
            this.product = {
              ...this.product,
              totalStock: oldTotalStock
            };

            // 🔄 NOTIFICAR ROLLBACK
            this.stockUpdateService.notifyStockChange({
              productId: this.product.id,
              variantId: variant.id,
              stockChange: -stockChange, // Revertir el cambio
              newStock: currentStock,
              timestamp: new Date(),
              source: 'admin',
              metadata: {
                colorName: variant.colorName,
                sizeName: variant.sizeName,
                productName: this.product.name,
                userAction: 'rollback_error'
              }
            });

            // Emitir rollback al padre
            this.productUpdated.emit({
              productId: this.product.id,
              updatedProduct: this.product
            });
          }

          this.message.error('Error al actualizar stock: ' + (error.message || 'Error desconocido'));
          this.cdr.detectChanges();
        }
      });
  }

  cancelEdit(): void {
    this.editingVariantId = null;
    this.cdr.markForCheck();
  }

  // 🚀 IMPLEMENTACIÓN OPTIMISTA PARA PROMOCIONES
  // En product-inventory.component.ts

  confirmApplyPromotion(promotionId: string): void {
    if (!this.selectedVariantForPromotion || !this.product) {
      this.message.error('No se ha seleccionado una variante de producto.');
      return;
    }

    const variant = this.selectedVariantForPromotion;
    const variantIndex = this.variants.findIndex(v => v.id === variant.id);
    if (variantIndex === -1) {
      this.message.error('Variante no encontrada en la lista local.');
      return;
    }

    const backup: VariantBackup = {
      originalVariant: { ...this.variants[variantIndex] },
      index: variantIndex
    };

    this.promotionService.getPromotionById(promotionId).pipe(
      switchMap(promotion => {
        if (!promotion) {
          return throwError(() => new Error('La promoción seleccionada no fue encontrada.'));
        }

        // 1. Actualización optimista (la UI cambia al instante)
        this.applyPromotionOptimistically(variant, promotion, backup);
        const updatedProduct = this.calculateUpdatedProductWithPromotions();
        this.productUpdated.emit({ productId: this.product!.id, updatedProduct });
        this.broadcastVariantPromotionApplied(variant, promotion);
        this.loading = true;
        this.cdr.detectChanges();

        // 2. Operación real en el servidor
        return this.productPriceService.applyPromotionToVariant(
          this.product!.id,
          variant.id,
          promotion,
          this.product!.price
        );
      }),
      finalize(() => {
        this.promotionModalVisible = false;
        this.selectedVariantForPromotion = null;
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.message.success('Promoción aplicada y guardada correctamente');
        this.cleanupPendingOperation(variant.id);
        this.applyFilters();
      },
      error: (error) => {
        this.rollbackPromotionChanges(variant.id);

        const rolledBackProduct = this.calculateUpdatedProductWithPromotions();
        this.productUpdated.emit({ productId: this.product!.id, updatedProduct: rolledBackProduct });
        this.broadcastVariantPromotionRemoved(variant, promotionId);
        this.message.error('Error al guardar la promoción: ' + error.message);
      }
    });
  }

  private calculateUpdatedProductWithPromotions(): Product {
    if (!this.product) return this.product!;

    // Recalcular precio del producto basado en variantes con promociones
    const hasPromotions = this.variants.some(v => v.promotionId);
    let productDiscount = 0;
    let productCurrentPrice = this.product.price;

    if (hasPromotions) {
      // Calcular descuento promedio ponderado por stock
      let totalStock = 0;
      let totalDiscountedValue = 0;

      this.variants.forEach(variant => {
        const variantStock = variant.stock || 0;
        totalStock += variantStock;

        if (variant.discountedPrice && variant.originalPrice) {
          const variantValue = variant.discountedPrice * variantStock;
          totalDiscountedValue += variantValue;
        } else {
          const variantPrice = variant.price || this.product!.price;
          totalDiscountedValue += variantPrice * variantStock;
        }
      });

      if (totalStock > 0) {
        productCurrentPrice = totalDiscountedValue / totalStock;
        productDiscount = Math.round(((this.product.price - productCurrentPrice) / this.product.price) * 100);
      }
    }

    return {
      ...this.product,
      currentPrice: productCurrentPrice,
      discountPercentage: productDiscount,
      variants: [...this.variants] // Incluir variantes actualizadas
    };
  }

  // 🎯 Aplicar promoción optimísticamente
  private applyPromotionOptimistically(
    variant: ProductVariant,
    promotion: Promotion,
    backup: VariantBackup
  ): void {
    // Registrar operación pendiente
    this.pendingOperations.set(variant.id, {
      type: 'promotion',
      variantId: variant.id,
      backup
    });

    // Calcular precio con descuento
    const originalPrice = variant.price || this.product?.price || 0;
    let discountedPrice = originalPrice;
    let maxDiscount = promotion.maxDiscountAmount || Infinity;

    if (promotion.discountType === 'percentage') {
      const discountAmount = originalPrice * (promotion.discountValue / 100);
      const finalDiscount = Math.min(discountAmount, maxDiscount);
      discountedPrice = originalPrice - finalDiscount;
    } else {
      discountedPrice = originalPrice - promotion.discountValue;
    }

    // 🔄 ACTUALIZAR VARIANTE INMEDIATAMENTE
    variant.promotionId = promotion.id;
    variant.discountType = promotion.discountType;
    variant.discountValue = promotion.discountValue;
    variant.originalPrice = originalPrice;
    variant.discountedPrice = Math.max(0, discountedPrice);


    // Forzar actualización visual
    this.applyFilters();
    this.cdr.detectChanges();
  }

  // 🔄 Rollback para promociones
  private rollbackPromotionChanges(variantId: string): void {
    const operation = this.pendingOperations.get(variantId);

    if (operation && operation.backup) {
      const { originalVariant, index } = operation.backup;

      if (index >= 0 && index < this.variants.length) {
        // Restaurar variante original
        this.variants[index] = { ...originalVariant };

        this.applyFilters();
        this.cdr.detectChanges();
      }
    }

    this.cleanupPendingOperation(variantId);
  }

  // 🚀 IMPLEMENTACIÓN OPTIMISTA PARA ELIMINACIÓN DE VARIANTES
  deleteVariant(variant: ProductVariant): void {
    this.modal.confirm({
      nzTitle: '¿Eliminar variante?',
      nzContent: `¿Está seguro de eliminar la variante ${variant.colorName} - ${variant.sizeName}?`,
      nzOkText: 'Eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        const variantIndex = this.variants.findIndex(v => v.id === variant.id);
        if (variantIndex === -1) {
          this.message.error('Variante no encontrada.');
          return;
        }

        const backup: VariantBackup = {
          originalVariant: { ...variant },
          index: variantIndex
        };
        this.deleteVariantOptimistically(variant.id, backup);

        // Calcular nuevo stock total
        const newTotalStock = this.variants.reduce((total, v) => total + (v.stock || 0), 0);

        if (this.product) {
          this.product = {
            ...this.product,
            totalStock: newTotalStock
          };

          // 🚀 NOTIFICAR ELIMINACIÓN DE STOCK
          this.stockUpdateService.notifyStockChange({
            productId: this.product.id,
            variantId: variant.id,
            stockChange: -(variant.stock || 0),
            newStock: 0, // La variante se elimina, stock = 0
            timestamp: new Date(),
            source: 'admin',
            metadata: {
              colorName: variant.colorName,
              sizeName: variant.sizeName,
              productName: this.product.name,
              userAction: 'variant_deletion'
            }
          });

          // 🚀 EMITIR EVENTO AL PADRE
          this.productUpdated.emit({
            productId: this.product.id,
            updatedProduct: this.product
          });
        }

        this.loading = true;
        this.message.success('Variante eliminada correctamente');

        this.inventoryService.deleteVariant(variant.id)
          .pipe(
            finalize(() => {
              this.loading = false;
              this.cdr.detectChanges();
            })
          )
          .subscribe({
            next: () => {
              console.log('✅ Variante eliminada exitosamente en servidor');
              this.cleanupPendingOperation(variant.id);
            },
            error: (error) => {
              console.error('❌ Error al eliminar variante en servidor:', error);

              // 🔄 ROLLBACK: Restaurar variante eliminada
              this.rollbackVariantDeletion(variant.id);

              // Emitir rollback al padre
              if (this.product) {
                const restoredTotalStock = this.variants.reduce((total, v) => total + (v.stock || 0), 0);
                this.product = {
                  ...this.product,
                  totalStock: restoredTotalStock
                };

                // 🔄 NOTIFICAR ROLLBACK DE ELIMINACIÓN
                this.stockUpdateService.notifyStockChange({
                  productId: this.product.id,
                  variantId: variant.id,
                  stockChange: variant.stock || 0, // Restaurar stock
                  newStock: variant.stock || 0,
                  timestamp: new Date(),
                  source: 'admin',
                  metadata: {
                    colorName: variant.colorName,
                    sizeName: variant.sizeName,
                    productName: this.product.name,
                    userAction: 'rollback_deletion'
                  }
                });

                this.productUpdated.emit({
                  productId: this.product.id,
                  updatedProduct: this.product
                });
              }

              this.message.error('Error al eliminar variante: ' + (error.message || 'Error desconocido'));
            }
          });
      }
    });
  }



  // 🗑️ Eliminar variante optimísticamente
  private deleteVariantOptimistically(variantId: string, backup: VariantBackup): void {
    // Registrar operación pendiente
    this.pendingOperations.set(variantId, {
      type: 'deletion',
      variantId,
      backup
    });

    // 🗑️ ELIMINAR DE LA LISTA INMEDIATAMENTE
    this.variants = this.variants.filter(v => v.id !== variantId);

    console.log(`🗑️ Variante eliminada optimísticamente:`, {
      variantId,
      remainingVariants: this.variants.length
    });

    // Forzar actualización visual
    this.cdr.detectChanges();
  }

  // 🔄 Rollback para eliminación
  private rollbackVariantDeletion(variantId: string): void {
    const operation = this.pendingOperations.get(variantId);

    if (operation && operation.backup) {
      const { originalVariant, index } = operation.backup;

      // 🔄 RESTAURAR VARIANTE EN SU POSICIÓN ORIGINAL
      this.variants.splice(index, 0, { ...originalVariant });

      console.log('🔄 Rollback aplicado para eliminación:', {
        variantId,
        restoredAtIndex: index,
        totalVariants: this.variants.length
      });

      this.cdr.detectChanges();
    }

    this.cleanupPendingOperation(variantId);
  }

  // 🧹 Limpiar operaciones pendientes
  private cleanupPendingOperation(variantId: string): void {
    this.pendingOperations.delete(variantId);
  }

  // 📊 Actualizar stock total del producto
  private updateProductTotalStock(): void {
    if (this.product) {
      const totalStock = this.variants.reduce((total, variant) => total + (variant.stock || 0), 0);

      this.product = {
        ...this.product,
        totalStock
      };

      console.log('📊 Stock total actualizado:', totalStock);
      this.cdr.detectChanges();
    }
  }

  // 🚀 ELIMINACIÓN OPTIMISTA DE PROMOCIONES
  removePromotion(variant: ProductVariant): void {
    this.modal.confirm({
      nzTitle: '¿Eliminar promoción?',
      nzContent: '¿Está seguro de eliminar la promoción aplicada a esta variante?',
      nzOkText: 'Sí, eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: () => {
        const variantIndex = this.variants.findIndex(v => v.id === variant.id);
        if (variantIndex === -1) return;

        const backup: VariantBackup = {
          originalVariant: { ...variant },
          index: variantIndex
        };

        const promotionId = variant.promotionId; // Guardar ID antes de eliminar

        // 🚀 REMOVER PROMOCIÓN OPTIMÍSTICAMENTE
        this.removePromotionOptimistically(variant, backup);

        // 🚀 EMITIR EVENTO AL PADRE
        const updatedProduct = this.calculateUpdatedProductWithPromotions();
        this.productUpdated.emit({
          productId: this.product!.id,
          updatedProduct
        });

        // 🆕 NUEVO: BROADCASTING A TODOS LOS COMPONENTES
        this.broadcastVariantPromotionRemoved(variant, promotionId!);

        this.loading = true;
        this.cdr.detectChanges();
        this.message.success('Promoción eliminada correctamente');

        this.productPriceService.removePromotionFromVariant(
          this.product!.id,
          variant.id
        ).pipe(
          finalize(() => {
            this.loading = false;
            this.cdr.detectChanges();
          })
        ).subscribe({
          next: () => {
            console.log('✅ Promoción eliminada exitosamente en servidor');
            this.cleanupPendingOperation(variant.id);
          },
          error: (error) => {
            console.error('❌ Error al eliminar promoción en servidor:', error);

            // 🔄 ROLLBACK
            this.rollbackPromotionRemoval(variant.id);

            // Emitir rollback al padre
            const rolledBackProduct = this.calculateUpdatedProductWithPromotions();
            this.productUpdated.emit({
              productId: this.product!.id,
              updatedProduct: rolledBackProduct
            });

            // 🆕 NUEVO: BROADCASTING DE ROLLBACK (reaplicar promoción)
            const promotion = this.promotions.find(p => p.id === promotionId);
            if (promotion) {
              this.broadcastVariantPromotionApplied(variant, promotion);
            }

            this.message.error('Error al eliminar promoción: ' + error.message);
          }
        });
      }
    });
  }

  // 🆕 NUEVO: Método para broadcasting cuando se aplica promoción a variante
  private broadcastVariantPromotionApplied(variant: ProductVariant, promotion: Promotion): void {
    if (!this.product || !variant || !promotion) {
      console.warn('❌ [BROADCAST] Datos insuficientes para broadcast');
      return;
    }

    try {
      // Usar tu método existente
      this.promotionStateService.notifyPromotionActivated(promotion.id, [this.product.id]);

      // También usar el nuevo método para variantes específicas
      this.promotionStateService.notifyGlobalUpdate({
        type: 'variant_promotion_applied',
        data: {
          type: 'applied',
          targetType: 'variant',
          targetId: variant.id,
          promotionId: promotion.id,
          affectedProducts: [this.product.id]
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('❌ [BROADCAST] Error en broadcast:', error);
    }
  }



  // 🆕 NUEVO: Método para broadcasting cuando se remueve promoción de variante
  private broadcastVariantPromotionRemoved(variant: ProductVariant, promotionId: string): void {
    if (!this.product) return;

    // Usar tu método existente
    this.promotionStateService.notifyPromotionDeactivated(promotionId, [this.product.id]);

    // También usar el nuevo método para variantes específicas
    this.promotionStateService.notifyGlobalUpdate({
      type: 'variant_promotion_removed',
      data: {
        type: 'removed',
        targetType: 'variant',
        targetId: variant.id,
        promotionId: promotionId,
        affectedProducts: [this.product.id]
      },
      timestamp: new Date()
    });
  }

  // 🗑️ Remover promoción optimísticamente
  private removePromotionOptimistically(variant: ProductVariant, backup: VariantBackup): void {
    // Registrar operación pendiente
    this.pendingOperations.set(variant.id, {
      type: 'promotion',
      variantId: variant.id,
      backup
    });

    // 🗑️ LIMPIAR DATOS DE PROMOCIÓN
    variant.promotionId = undefined;
    variant.discountType = undefined;
    variant.discountValue = undefined;
    variant.originalPrice = undefined;
    variant.discountedPrice = undefined;

    console.log(`🗑️ Promoción removida optimísticamente:`, {
      variantId: variant.id
    });

    this.cdr.detectChanges();
  }

  // 🔄 Rollback para remoción de promoción
  private rollbackPromotionRemoval(variantId: string): void {
    // Reutilizar la misma lógica de rollback de promociones
    this.rollbackPromotionChanges(variantId);
  }

  // ==================== MÉTODOS DE TRANSFERENCIA DE STOCK ====================

  /**
   * 🆕 Abre el modal de transferencia de stock para una variante específica.
   * @param variant La variante de producto a transferir.
   */
  openTransferModal(variant: ProductVariant): void {
    if (!this.product) {
      this.message.error('No se pudo obtener la información del producto');
      return;
    }

    console.log('🔍 Debug - Abriendo modal con:', {
      product: this.product,
      variant: variant
    });

    const modalRef = this.modal.create({
      nzTitle: 'Transferir Stock a Distribuidor',
      nzContent: InventoryTransferModalComponent,
      nzWidth: this.getModalWidth(),
      nzMaskClosable: false,
      // ✅ CORRECCIÓN: Pasar objetos completos, no solo IDs
      nzData: {
        product: this.product,     // ✅ Objeto completo del producto
        variant: variant           // ✅ Objeto completo de la variante
      },
      nzFooter: null  // ✅ El modal maneja sus propios botones
    });

    // Escuchamos cuando el modal se cierra exitosamente
    modalRef.afterClose.subscribe((result: any) => {
      if (result && result.success) {
        this.onTransferSuccess();
      }
    });
  }

  /**
   * ✅ MEJORADO: Maneja el éxito de la transferencia, recarga el producto
   * completo y lo emite al componente padre.
   */
  onTransferSuccess(): void {
    if (!this.product) return;

    this.message.success('Stock transferido correctamente. Actualizando inventario...');
    this.loading = true; // Activamos el spinner para feedback

    // Forzamos la recarga del producto para obtener el 'totalStock' actualizado
    this.productService.forceRefreshProduct(this.product.id).subscribe({
      next: (freshProduct) => {
        if (freshProduct) {
          // 1. Actualizamos el producto local en el drawer
          this.product = freshProduct;

          // 2. Recargamos la lista de variantes (que ahora tendrá el stock reducido)
          this.loadVariants();

          // 3. Emitimos el evento con el producto completo y actualizado
          this.productUpdated.emit({
            productId: this.product.id,
            updatedProduct: freshProduct // Enviamos el objeto completo
          });
        }
        this.loading = false;
      },
      error: (err) => {
        this.message.error('Error al actualizar el producto después de la transferencia.');
        this.loading = false;
        // En caso de error, recargamos las variantes de todas formas para ver si algo cambió
        this.loadVariants();
      }
    });
  }

  // Formateo y utilidades
  getStockStatusColor(stock: number): string {
    if (stock <= 0) return 'error';
    if (stock <= 5) return 'warning';
    return 'success';
  }

  getStockStatusText(stock: number): string {
    if (stock <= 0) return 'Sin stock';
    if (stock <= 5) return 'Stock bajo';
    return 'En stock';
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.src = 'assets/images/product-placeholder.png';
      imgElement.classList.add('error-image');
    }
  }

  // Función para cargar promociones
  loadPromotions(): void {
    this.promotionService.getActivePromotions().subscribe({
      next: (promotions) => {
        this.promotions = promotions;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al cargar promociones:', error);
        this.message.error('Error al cargar promociones: ' + error.message);
      }
    });
  }

  applyPromotion(variant: ProductVariant): void {
    this.selectedVariantForPromotion = variant;
    this.loading = true;

    this.promotionService.getActivePromotions().pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (promotions) => {
        this.promotions = promotions;
        this.promotionModalVisible = true;

        // En móvil, cerrar filtros expandidos para dar más espacio
        if (this.isMobile && this.filtersExpanded) {
          this.filtersExpanded = false;
        }

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error al cargar promociones:', error);
        this.message.error('Error al cargar promociones. Intente nuevamente.');
        this.cdr.detectChanges();
      }
    });
  }

  // 🆕 OPTIMIZACIÓN: Lazy loading para imágenes en móvil
  shouldLazyLoadImages(): boolean {
    return this.isMobile;
  }

  getInputNumberConfig(): any {
    return {
      size: this.isMobile ? 'small' : 'middle',
      style: {
        width: this.isMobile ? '60px' : '80px',
        fontSize: this.isMobile ? '11px' : '12px'
      }
    };
  }

  getButtonConfig(): any {
    return {
      size: this.isMobile ? 'small' : 'default',
      style: {
        fontSize: this.isMobile ? '10px' : '12px',
        padding: this.isMobile ? '2px 4px' : '4px 8px'
      }
    };
  }

  shouldOptimizePerformance(): boolean {
    return this.isMobile && this.filteredVariants.length > 20;
  }

  getVirtualScrollConfig(): any {
    if (this.shouldOptimizePerformance()) {
      return {
        itemSize: 40,
        maxToleratedSize: 200
      };
    }
    return null;
  }

  onKeyboardNavigation(event: KeyboardEvent, action: string): void {
    if (this.isMobile) {
      // Implementar navegación por teclado simplificada para móvil
      switch (event.key) {
        case 'Enter':
          event.preventDefault();
          if (action === 'toggleFilters') {
            this.toggleFiltersExpanded();
          }
          break;
        case 'Escape':
          event.preventDefault();
          if (this.filtersExpanded) {
            this.filtersExpanded = false;
            this.cdr.detectChanges();
          }
          break;
      }
    }
  }

  // 🆕 UTILIDAD: Formatear texto para móvil
  getMobileText(text: string, maxLength: number = 20): string {
    if (!this.isMobile) return text;
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  // 🆕 CONFIGURACIÓN: Obtener configuración de tooltip para móvil
  getTooltipConfig(): any {
    return {
      nzPlacement: this.isMobile ? 'top' : 'topLeft',
      nzMouseEnterDelay: this.isMobile ? 0.8 : 0.5,
      nzOverlayStyle: {
        fontSize: this.isMobile ? '11px' : '12px'
      }
    };
  }


  // Función para cancelar la aplicación de promoción
  cancelApplyPromotion(): void {
    this.promotionModalVisible = false;
    this.selectedVariantForPromotion = null;
    this.cdr.markForCheck();
  }

  formatDate(date: Date): string {
    if (!date) return '';

    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date instanceof Date ? date : new Date(date));
  }

  // Método para mostrar información de promoción en un tag
  getPromotionBadgeText(variant: ProductVariant): string {
    if (!variant.promotionId) return '';

    if (variant.discountType === 'percentage') {
      return `${variant.discountValue}% OFF`;
    } else {
      return `$${(variant.discountValue ?? 0).toFixed(2)} OFF`;
    }
  }

  // Método para mostrar información detallada de la promoción
  getPromotionInfo(variant: ProductVariant): string {
    if (!variant.promotionId) return '';

    let text = '';

    // Buscar la promoción en la lista de promociones cargadas
    const promotion = this.promotions.find(p => p.id === variant.promotionId);

    if (promotion) {
      text = `${promotion.name} - `;
    }

    if (variant.discountType === 'percentage') {
      text += `Descuento del ${variant.discountValue}%`;
      if (variant.originalPrice && variant.discountedPrice) {
        const saved = variant.originalPrice - variant.discountedPrice;
        text += ` (Ahorro: $${saved.toFixed(2)})`;
      }
    } else {
      text += `Descuento fijo de $${(variant.discountValue ?? 0).toFixed(2)}`;
    }

    if (promotion) {
      text += `\nVálido hasta: ${this.formatDate(promotion.endDate)}`;
    }

    return text;
  }

  trackByVariant(index: number, variant: ProductVariant): string {
    return variant.id;
  }
}
