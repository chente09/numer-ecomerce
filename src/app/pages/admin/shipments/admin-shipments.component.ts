import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';

import { ShipmentService } from '../../../services/admin/shipments/shipment.service';
import { DistributorService } from '../../../services/admin/distributor/distributor.service';
import { UsersService, UserProfile } from '../../../services/users/users.service';
import { Shipment } from '../../../models/models';

import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzEmptyModule } from 'ng-zorro-antd/empty';

@Component({
  selector: 'app-admin-shipments',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzTableModule, NzTagModule, NzButtonModule, NzIconModule,
    NzModalModule, NzInputModule, NzInputNumberModule,
    NzCardModule, NzSpinModule,
    NzToolTipModule, NzPopconfirmModule, NzEmptyModule,
  ],
  template: `
    <nz-card nzTitle="Envíos a Distribuidores">
      <nz-spin [nzSpinning]="loading">
        <nz-table
          #table
          [nzData]="shipments"
          nzSize="middle"
          [nzPageSize]="20">
          <thead>
            <tr>
              <th>ID</th>
              <th>Distribuidor</th>
              <th>Items</th>
              <th>Costo envío</th>
              <th>Estado</th>
              <th>Fecha creación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of table.data">
              <td>
                <span style="font-family:monospace;font-size:12px">
                  #{{ s.id?.slice(-6)?.toUpperCase() }}
                </span>
              </td>
              <td>{{ getDistributorName(s.distributorId) }}</td>
              <td>
                <span nz-tooltip [nzTooltipTitle]="itemsTooltip(s)">
                  {{ s.itemSummary?.length || 0 }} línea(s)
                </span>
              </td>
              <td>
                <span *ngIf="s.shippingCost != null">\${{ s.shippingCost | number:'1.2-2' }}</span>
                <span *ngIf="s.shippingCost == null" style="color:#aaa">—</span>
              </td>
              <td>
                <nz-tag [nzColor]="statusColor(s.status)">{{ statusLabel(s.status) }}</nz-tag>
              </td>
              <td>{{ s.createdAt?.toDate() | date:'dd/MM/yyyy HH:mm' }}</td>
              <td>
                <button
                  *ngIf="s.status === 'open'"
                  nz-button nzType="primary" nzSize="small"
                  (click)="openMarkSentModal(s)">
                  <span nz-icon nzType="send"></span> Marcar enviado
                </button>
                <span *ngIf="s.status === 'sent'" style="color:#aaa;font-size:12px">
                  Esperando confirmación
                </span>
                <span *ngIf="s.status === 'delivered'" style="color:#52c41a;font-size:12px">
                  <span nz-icon nzType="check-circle"></span> Entregado
                </span>
              </td>
            </tr>
          </tbody>
        </nz-table>
      </nz-spin>
    </nz-card>

    <!-- Modal: marcar como enviado -->
    <nz-modal
      [(nzVisible)]="markSentVisible"
      nzTitle="Marcar envío como despachado"
      [nzFooter]="modalFooter"
      (nzOnCancel)="closeMarkSentModal()">
      <ng-container *nzModalContent>
        <div style="margin-bottom:16px">
          <label style="display:block;margin-bottom:4px">Costo de envío (USD) *</label>
          <nz-input-number
            [(ngModel)]="markSentData.shippingCost"
            [nzMin]="0" [nzStep]="0.5" [nzPrecision]="2"
            nzPlaceHolder="0.00"
            style="width:100%">
          </nz-input-number>
        </div>
        <div style="margin-bottom:16px">
          <label style="display:block;margin-bottom:4px">Link de tracking (opcional)</label>
          <input nz-input [(ngModel)]="markSentData.trackingUrl"
            placeholder="https://www.servientrega.com.ec/rastreo/..." />
        </div>
        <div>
          <label style="display:block;margin-bottom:4px">Observación (opcional)</label>
          <textarea nz-input [(ngModel)]="markSentData.notes" rows="2"
            placeholder="Ej: Despachado por Servientrega, guía #12345"></textarea>
        </div>
      </ng-container>
      <ng-template #modalFooter>
        <button nz-button (click)="closeMarkSentModal()">Cancelar</button>
        <button nz-button nzType="primary"
          [nzLoading]="submitting"
          [disabled]="markSentData.shippingCost == null"
          (click)="confirmMarkSent()">
          Confirmar despacho
        </button>
      </ng-template>
    </nz-modal>
  `,
})
export class AdminShipmentsComponent implements OnInit, OnDestroy {
  private shipmentService = inject(ShipmentService);
  private distributorService = inject(DistributorService);
  private usersService = inject(UsersService);
  private modal = inject(NzModalService);
  private message = inject(NzMessageService);

  private destroy$ = new Subject<void>();

  shipments: Shipment[] = [];
  distributors: UserProfile[] = [];
  loading = true;
  submitting = false;

  markSentVisible = false;
  selectedShipment: Shipment | null = null;
  markSentData = { shippingCost: null as number | null, trackingUrl: '', notes: '' };

  currentAdminUid = '';

  ngOnInit(): void {
    this.usersService.user$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      if (u) this.currentAdminUid = u.uid;
    });

    this.shipmentService.getAllShipments().pipe(takeUntil(this.destroy$)).subscribe({
      next: s => { this.shipments = s; this.loading = false; },
      error: () => { this.loading = false; }
    });

    this.distributorService.getDistributors().pipe(takeUntil(this.destroy$)).subscribe(d => {
      this.distributors = d;
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  getDistributorName(id: string): string {
    const d = this.distributors.find(x => x.uid === id);
    return d?.displayName || d?.email || id;
  }

  statusColor(status: string): string {
    return { open: 'blue', sent: 'orange', delivered: 'green' }[status] || 'default';
  }

  statusLabel(status: string): string {
    return { open: 'Abierto', sent: 'En camino', delivered: 'Entregado' }[status] || status;
  }

  itemsTooltip(s: Shipment): string {
    return s.itemSummary?.map(i =>
      `${i.productName} (${i.variantLabel}) x${i.quantity}`
    ).join('\n') || '';
  }

  openMarkSentModal(s: Shipment): void {
    this.selectedShipment = s;
    this.markSentData = { shippingCost: null, trackingUrl: '', notes: '' };
    this.markSentVisible = true;
  }

  closeMarkSentModal(): void {
    this.markSentVisible = false;
    this.selectedShipment = null;
  }

  async confirmMarkSent(): Promise<void> {
    if (!this.selectedShipment?.id || this.markSentData.shippingCost == null) return;
    this.submitting = true;
    try {
      await this.shipmentService.markAsSent(
        this.selectedShipment.id,
        this.selectedShipment.distributorId,
        this.markSentData.shippingCost,
        this.currentAdminUid,
        this.markSentData.trackingUrl || undefined,
        this.markSentData.notes || undefined,
      );
      this.message.success('Envío marcado como despachado y costo registrado en el libro contable.');
      this.closeMarkSentModal();
    } catch (e: any) {
      this.message.error(`Error: ${e.message}`);
    } finally {
      this.submitting = false;
    }
  }
}
