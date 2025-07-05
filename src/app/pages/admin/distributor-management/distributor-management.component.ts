import { Component, OnInit, ChangeDetectorRef, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, of, forkJoin, map } from 'rxjs'; // ✅ AÑADIDO: map y forkJoin
import { catchError, finalize, switchMap } from 'rxjs/operators'; // ✅ AÑADIDO: switchMap

// Tus Servicios
import { DistributorService, DistributorInventoryItem, TransferDetails } from '../../../services/admin/distributor/distributor.service'; // ✅ AÑADIDO: TransferDetails
import { UserProfile, UsersService } from '../../../services/users/users.service'; // ✅ AÑADIDO: UsersService (para el UID)
import { ProductService } from '../../../services/admin/product/product.service'; // ✅ AÑADIDO: ProductService

// ✅ AÑADIDO: Modelo de Producto
import { Product } from '../../../models/models';

// Módulos NG-ZORRO
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzGridModule } from 'ng-zorro-antd/grid';
// ✅ AÑADIDO: Módulos necesarios para la nueva funcionalidad
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzModalService, NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';

// ✅ AÑADIDO: Interfaz para el item de inventario enriquecido
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
  // Datos del producto padre para la fila principal
  productId: string;
  productName?: string;
  productModel?: string;
  variantImageUrl?: string;
  totalStockForDistributor: number;
  level: 0; // Para la tabla anidada
  expand: boolean; // Para controlar si está expandido
  children: EnrichedDistributorInventoryItem[]; // Las variantes son los hijos
}

@Component({
  selector: 'app-distributor-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzCardModule,
    NzSelectModule,
    NzTableModule,
    NzSpinModule,
    NzEmptyModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzGridModule,
    NzStatisticModule,
    NzAvatarModule,
    NzModalModule,
    NzInputNumberModule,
    NzToolTipModule
  ],
  templateUrl: './distributor-management.component.html',
  styleUrls: ['./distributor-management.component.css']
})
export class DistributorManagementComponent implements OnInit {
  distributors$: Observable<UserProfile[]> = of([]);
  selectedDistributorId: string | null = null;

  // 🔄 MODIFICADO: El inventario ahora usará la interfaz enriquecida
  inventory: EnrichedDistributorInventoryItem[] = [];
  isLoadingDistributors = false;
  isLoadingInventory = false;
  hasSearched = false;
  groupedInventory: GroupedInventoryProduct[] = [];
  inventoryStats: InventoryStats | null = null;

  @ViewChild('revertModalContent', { static: false }) revertModalContent!: TemplateRef<{ item: EnrichedDistributorInventoryItem }>;
  quantityToRevert: number = 1;

  // ✅ AÑADIDO: Inyectar los nuevos servicios necesarios
  constructor(
    private distributorService: DistributorService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef,
    private productService: ProductService,
    private modal: NzModalService,
    private usersService: UsersService // Para obtener el UID del admin actual
  ) { }

  ngOnInit(): void {
    this.loadDistributors();
  }

  loadDistributors(): void {
    this.isLoadingDistributors = true;
    this.distributors$ = this.distributorService.getDistributors().pipe(
      catchError(err => {
        this.message.error('No se pudieron cargar los distribuidores.');
        console.error(err);
        return of([]);
      }),
      finalize(() => {
        this.isLoadingDistributors = false;
        this.cdr.markForCheck();
      })
    );
  }

  // 🔄 MODIFICADO: El método ahora enriquece los datos del inventario
  onDistributorChange(distributorId: string | null): void {
    this.selectedDistributorId = distributorId;
    this.inventory = [];
    this.groupedInventory = []; // Limpiar datos agrupados
    this.inventoryStats = null; // Limpiar estadísticas
    this.hasSearched = false;

    if (!distributorId) {
      return;
    }

    this.isLoadingInventory = true;
    this.hasSearched = true;

    this.distributorService.getDistributorInventory(distributorId).pipe(
      switchMap(inventoryItems => {
        if (inventoryItems.length === 0) {
          return of([]);
        }

        const productIds = [...new Set(inventoryItems.map(item => item.productId))];

        const productObservables = productIds.map(id =>
          this.productService.getProductById(id).pipe(
            catchError(() => of(null))
          )
        );

        return forkJoin(productObservables).pipe(
          map(products => {
            const productsMap = new Map<string, Product>();
            products.forEach(p => {
              if (p) productsMap.set(p.id, p);
            });

            return inventoryItems.map(item => {
              const product = productsMap.get(item.productId);
              const variant = product?.variants.find(v => v.id === item.variantId);

              return {
                ...item,
                productName: product?.name || 'Producto no encontrado',
                productModel: product?.model || 'N/A',
                variantImageUrl: variant?.imageUrl || product?.imageUrl
              };
            });
          })
        );
      }),
      finalize(() => {
        this.isLoadingInventory = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (enrichedInventory) => {
        this.inventory = enrichedInventory;
        if (this.inventory.length > 0) {
          this.inventoryStats = this.calculateStats(this.inventory);
          this.groupedInventory = this.groupInventoryByProduct(this.inventory);
        }
      },
      error: (err) => {
        this.message.error(`Error al cargar el inventario del distribuidor.`);
        console.error(err);
      }
    });
  }

  // ✅ AÑADIDO: Método para calcular estadísticas
  private calculateStats(inventory: EnrichedDistributorInventoryItem[]): InventoryStats {
    const uniqueProducts = new Set(inventory.map(item => item.productId));
    const totalStock = inventory.reduce((sum, item) => sum + item.stock, 0);
    return {
      totalUniqueProducts: uniqueProducts.size,
      totalVariants: inventory.length,
      totalStock: totalStock
    };
  }

  // ✅ AÑADIDO: Método para agrupar el inventario por producto
  private groupInventoryByProduct(inventory: EnrichedDistributorInventoryItem[]): GroupedInventoryProduct[] {
    const grouped = new Map<string, GroupedInventoryProduct>();

    inventory.forEach(item => {
      if (!grouped.has(item.productId)) {
        // Si es la primera vez que vemos este producto, creamos la entrada padre
        grouped.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          productModel: item.productModel,
          variantImageUrl: item.variantImageUrl, // Usamos la imagen del primer item como representativa
          totalStockForDistributor: 0, // Lo calcularemos ahora
          level: 0,
          expand: false,
          children: []
        });
      }

      const productGroup = grouped.get(item.productId)!;
      productGroup.children.push(item);
    });

    // Calculamos el stock total por producto y devolvemos el array
    return Array.from(grouped.values()).map(group => {
      group.totalStockForDistributor = group.children.reduce((sum, child) => sum + child.stock, 0);
      return group;
    });
  }

  // ✅ AÑADIDO: Lógica para revertir la transferencia
  revertTransfer(item: EnrichedDistributorInventoryItem): void {
    this.quantityToRevert = 1;

    this.modal.create({
      nzTitle: `Revertir stock de "${item.productName}"`,
      nzContent: this.revertModalContent,

      // 🛠️ CORRECCIÓN: Pasa el objeto 'item' directamente.
      // Antes era: nzData: { item: item }
      nzData: item,

      nzOnOk: () => {
        this.executeRevert(item, this.quantityToRevert);
      }
    });
  }

  // ✅ AÑADIDO: Lógica para ejecutar la reversión
  private executeRevert(item: EnrichedDistributorInventoryItem, quantity: number): void {
    if (!this.selectedDistributorId) {
      this.message.error("No hay un distribuidor seleccionado.");
      return;
    }

    const adminUid = this.usersService.getCurrentUser()?.uid;
    if (!adminUid) {
      this.message.error("No se pudo identificar al administrador. Por favor, recargue la página.");
      return;
    }

    const transferDetails: TransferDetails = {
      distributorId: this.selectedDistributorId,
      variantId: item.variantId,
      productId: item.productId,
      quantity: quantity,
      performedByUid: adminUid,
      notes: `Reversión desde distribuidor.`
    };

    this.isLoadingInventory = true;
    this.distributorService.receiveStockFromDistributor(transferDetails).subscribe({
      next: () => {
        this.message.success(`${quantity} unidad(es) devuelta(s) al almacén principal.`);
        this.onDistributorChange(this.selectedDistributorId);
      },
      error: (err) => {
        this.message.error(`Error al revertir la transferencia: ${err.message}`);
        this.isLoadingInventory = false;
        this.cdr.markForCheck();
      }
    });
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return d.toLocaleDateString('es-EC', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
}