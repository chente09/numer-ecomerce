import { Component, OnInit, ChangeDetectorRef, inject, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, of, forkJoin, map } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

// Servicios y Modelos
import { DistributorService, DistributorInventoryItem } from '../../../../services/admin/distributor/distributor.service';
import { UsersService } from '../../../../services/users/users.service';
import { ProductService } from '../../../../services/admin/product/product.service';
import { Product } from '../../../../models/models';

// Módulos NG-ZORRO
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { FormsModule } from '@angular/forms';
import { NzInputModule } from 'ng-zorro-antd/input';
import { MovementHistoryComponent } from "../movement-history-component/movement-history-component.component";
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { DistributorOrdersHistoryComponent } from "../distributor-orders-history/distributor-orders-history.component";

// Reutilizamos las mismas interfaces
export interface EnrichedDistributorInventoryItem extends DistributorInventoryItem {
  productName?: string;
  productModel?: string;
  variantImageUrl?: string;
}

export interface InventoryStats {
  totalUniqueProducts: number;
  totalVariants: number;
  totalStock: number;
}

export interface GroupedInventoryProduct {
  productId: string;
  productName?: string;
  productModel?: string;
  variantImageUrl?: string;
  totalStockForDistributor: number;
  level: 0;
  expand: boolean;
  children: EnrichedDistributorInventoryItem[];
}


@Component({
  selector: 'app-my-inventory',
  standalone: true,
  imports: [
    CommonModule,
    NzCardModule,
    NzTableModule,
    NzSpinModule,
    NzEmptyModule,
    NzAvatarModule,
    NzTagModule,
    NzStatisticModule,
    NzGridModule,
    NzButtonModule,
    NzIconModule,
    NzToolTipModule,
    NzInputNumberModule,
    FormsModule,
    NzModalModule,
    NzInputModule,
    NzTabsModule,
    MovementHistoryComponent,
    DistributorOrdersHistoryComponent
],
  templateUrl: './my-inventory.component.html',
  styleUrl: './my-inventory.component.css'
})

export class MyInventoryComponent implements OnInit {
  groupedInventory: GroupedInventoryProduct[] = [];
  inventoryStats: InventoryStats | null = null;
  isLoading = false;
  currentUserId: string | null = null;
  @ViewChild('saleModalContent', { static: false }) saleModalContent!: TemplateRef<any>;
  quantityToSell: number = 1;

  // Almacena la lista original sin filtrar
  private originalGroupedInventory: GroupedInventoryProduct[] = []; 
  // La lista que se mostrará en la tabla (ya filtrada)
  filteredGroupedInventory: GroupedInventoryProduct[] = [];
  // El término de búsqueda del input
  searchTerm: string = '';

  constructor(
    private distributorService: DistributorService,
    private usersService: UsersService,
    private productService: ProductService,
    private message: NzMessageService,
    private modal: NzModalService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    const currentUser = this.usersService.getCurrentUser();
    if (currentUser) {
      this.currentUserId = currentUser.uid;
      this.loadInventory(this.currentUserId);
    } else {
      this.message.error("No se pudo identificar al usuario. Por favor, inicie sesión de nuevo.");
    }
  }

  loadInventory(distributorId: string): void {
    this.isLoading = true;
    this.distributorService.getDistributorInventory(distributorId).pipe(
      switchMap(inventoryItems => {
        if (inventoryItems.length === 0) return of({ grouped: [], stats: null });

        const productIds = [...new Set(inventoryItems.map(item => item.productId))];
        const productObservables = productIds.map(id => this.productService.getProductById(id).pipe(catchError(() => of(null))));

        return forkJoin(productObservables).pipe(
          map(products => {
            const productsMap = new Map<string, Product>();
            products.forEach(p => { if (p) productsMap.set(p.id, p); });

            const enriched = inventoryItems.map(item => {
              const product = productsMap.get(item.productId);
              const variant = product?.variants.find(v => v.id === item.variantId);
              return {
                ...item,
                productName: product?.name || 'Producto no encontrado',
                productModel: product?.model || 'N/A',
                variantImageUrl: variant?.imageUrl || product?.imageUrl
              };
            });

            const stats = this.calculateStats(enriched);
            const grouped = this.groupInventoryByProduct(enriched);
            return { grouped, stats };
          })
        );
      }),
      finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (result) => {
        this.inventoryStats = result.stats;
        // Guardamos la lista completa y la filtrada
        this.originalGroupedInventory = result.grouped;
        this.applyFilters(); // Aplicamos los filtros
      },
      error: (err) => {
        this.message.error(`Error al cargar tu inventario.`);
        console.error(err);
      }
    });
  }

  // ✅ 5. AÑADE EL MÉTODO PARA APLICAR LOS FILTROS
  applyFilters(): void {
    const term = this.searchTerm.toLowerCase().trim();

    // Si no hay término de búsqueda, mostramos todo
    if (!term) {
      this.filteredGroupedInventory = [...this.originalGroupedInventory];
      return;
    }

    // Filtramos la lista original
    this.filteredGroupedInventory = this.originalGroupedInventory
      .map(product => {
        // Creamos una copia del producto para no modificar el original
        const newProduct = { ...product };
        
        // Filtramos las variantes (hijos) que coincidan con la búsqueda
        newProduct.children = product.children.filter(variant => 
          variant.productName?.toLowerCase().includes(term) ||
          variant.productModel?.toLowerCase().includes(term) ||
          variant.colorName.toLowerCase().includes(term) ||
          variant.sizeName.toLowerCase().includes(term) ||
          variant.sku.toLowerCase().includes(term)
        );
        
        return newProduct;
      })
      // Mantenemos en la lista final solo los productos cuyo nombre coincida
      // O que tengan al menos una variante que coincida.
      .filter(product => 
        product.productName?.toLowerCase().includes(term) || 
        product.productModel?.toLowerCase().includes(term) ||
        product.children.length > 0
      );
  }


  registerSale(item: EnrichedDistributorInventoryItem): void {
    // Reseteamos la cantidad a 1 cada vez que se abre el modal
    this.quantityToSell = 1;

    this.modal.create({
      nzTitle: `Registrar venta de "${item.productName}"`,
      nzContent: this.saleModalContent,
      nzData: item,
      nzOnOk: () => {
        if (!this.currentUserId) return;

        const saleDetails = {
          distributorId: this.currentUserId,
          variantId: item.variantId,
          quantity: this.quantityToSell,
          notes: `Venta registrada desde el panel.` // ✅ CORRECCIÓN
        };

        this.isLoading = true;
        this.distributorService.registerDistributorSale(saleDetails)
          .then(() => {
            this.message.success('Venta registrada correctamente.');
            this.loadInventory(this.currentUserId!);
          })
          .catch(err => {
            this.message.error(`Error al registrar la venta: ${err.message}`);
            this.isLoading = false;
          });
      }
    });
  }

  // Los métodos de cálculo y formato son iguales
  private calculateStats = (inventory: EnrichedDistributorInventoryItem[]): InventoryStats => ({
    totalUniqueProducts: new Set(inventory.map(item => item.productId)).size,
    totalVariants: inventory.length,
    totalStock: inventory.reduce((sum, item) => sum + item.stock, 0)
  });

  private groupInventoryByProduct = (inventory: EnrichedDistributorInventoryItem[]): GroupedInventoryProduct[] => {
    const grouped = new Map<string, GroupedInventoryProduct>();
    inventory.forEach(item => {
      if (!grouped.has(item.productId)) {
        grouped.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          productModel: item.productModel,
          variantImageUrl: item.variantImageUrl,
          totalStockForDistributor: 0,
          level: 0,
          expand: false,
          children: []
        });
      }
      const productGroup = grouped.get(item.productId)!;
      productGroup.children.push(item);
    });
    return Array.from(grouped.values()).map(group => {
      group.totalStockForDistributor = group.children.reduce((sum, child) => sum + child.stock, 0);
      return group;
    });
  }

  formatDate = (date: any): string => {
    if (!date) return 'N/A';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
