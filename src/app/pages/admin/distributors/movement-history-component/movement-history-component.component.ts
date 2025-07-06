import { Component, OnInit, Input, OnChanges, SimpleChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, Observable, of } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';

// Servicios y Modelos
import { DistributorService } from '../../../../services/admin/distributor/distributor.service';
import { ProductService } from '../../../../services/admin/product/product.service';

// Módulos NG-ZORRO
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FormsModule } from '@angular/forms';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzCardModule } from 'ng-zorro-antd/card';

export interface EnrichedMovement {
  // Propiedades que vienen del log de Firestore
  type: 'transfer_out' | 'transfer_in' | 'distributor_sale';
  productId: string;
  variantId: string;
  quantity: number;
  timestamp: Timestamp;
  notes?: string;

  // Propiedades que añadimos al enriquecer los datos
  productName?: string;
  variantInfo?: string;
}

@Component({
  selector: 'app-movement-history-component',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzTableModule,
    NzSpinModule,
    NzTagModule,
    NzIconModule,
    NzToolTipModule,
    NzEmptyModule,
    NzInputModule,
    NzCardModule
  ],
  templateUrl: './movement-history-component.component.html',
  styleUrl: './movement-history-component.component.css'
})
export class MovementHistoryComponent implements OnInit, OnChanges {
  @Input() distributorId: string | null = null;

  private distributorService = inject(DistributorService);
  private productService = inject(ProductService);
  private message = inject(NzMessageService);
  private cdr = inject(ChangeDetectorRef);

  movements: EnrichedMovement[] = [];
  isLoading = false;

  private originalMovements: EnrichedMovement[] = [];
  filteredMovements: EnrichedMovement[] = [];
  searchTerm: string = '';

  ngOnInit(): void {
    if (this.distributorId) {
      this.loadHistory();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['distributorId'] && !changes['distributorId'].isFirstChange()) {
      this.loadHistory();
    }
  }

  loadHistory(): void {
    if (!this.distributorId) return;

    this.isLoading = true;
    this.distributorService.getDistributorInventoryMovements(this.distributorId).pipe(
      switchMap(movements => {
        if (!movements || movements.length === 0) return of([]);
        return this.enrichMovementData(movements);
      }),
      finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (enrichedMovements) => {
        this.originalMovements = enrichedMovements;
        this.applyFilters(); // Aplicar filtros al cargar
      },
      error: (err) => {
        this.message.error('No se pudo cargar el historial de movimientos.');
        console.error("Error cargando historial de movimientos", err);
      }
    });
  }


  applyFilters(): void {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredMovements = [...this.originalMovements];
      return;
    }

    this.filteredMovements = this.originalMovements.filter(movement =>
      movement.productName?.toLowerCase().includes(term) ||
      movement.variantInfo?.toLowerCase().includes(term) ||
      movement.notes?.toLowerCase().includes(term)
    );
  }

  /**
   * ✅ MÉTODO COMPLETADO: Busca los detalles de cada producto y variante.
   */
  private enrichMovementData(movements: any[]): Observable<EnrichedMovement[]> {
    // Obtenemos arrays de IDs únicos para no hacer llamadas repetidas
    const productIds = [...new Set(movements.map(m => m.productId).filter(id => id))];
    const variantIds = [...new Set(movements.map(m => m.variantId).filter(id => id))];

    if (productIds.length === 0 || variantIds.length === 0) {
      return of(movements); // Devuelve los movimientos tal cual si no hay IDs
    }

    // Creamos observables para obtener todos los productos y variantes en paralelo
    const products$ = forkJoin(
      productIds.map(id => this.productService.getProductById(id).pipe(catchError(() => of(null))))
    );
    const variants$ = forkJoin(
      variantIds.map(id => this.productService.getVariantById(id).pipe(catchError(() => of(null))))
    );

    // Combinamos los resultados de ambas llamadas
    return forkJoin({ products: products$, variants: variants$ }).pipe(
      map(({ products, variants }) => {
        // Creamos mapas para una búsqueda rápida y eficiente
        const productsMap = new Map(products.filter(p => p).map(p => [p!.id, p]));
        const variantsMap = new Map(variants.filter(v => v).map(v => [v!.id, v]));

        // Mapeamos cada movimiento para añadirle la información enriquecida
        return movements.map(movement => {
          const product = productsMap.get(movement.productId);
          const variant = variantsMap.get(movement.variantId);
          return {
            ...movement,
            productName: product?.name || 'Producto Desconocido',
            variantInfo: variant ? `${variant.colorName} / ${variant.sizeName}` : 'Variante Desconocida'
          };
        });
      })
    );
  }

  getMovementTag(type: string): { color: string, icon: string, text: string } {
    switch (type) {
      case 'transfer_out': return { color: 'blue', icon: 'arrow-down', text: 'Transferencia Recibida' };
      case 'transfer_in': return { color: 'orange', icon: 'arrow-up', text: 'Stock Devuelto' };
      case 'distributor_sale': return { color: 'green', icon: 'shopping-cart', text: 'Venta Registrada' };
      default: return { color: 'default', icon: 'question', text: type };
    }
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return d.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
  }
}
