import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, filter, take } from 'rxjs/operators';

import { ShipmentService } from '../../../../services/admin/shipments/shipment.service';
import { UsersService } from '../../../../services/users/users.service';
import { Shipment } from '../../../../models/models';

import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzAlertModule } from 'ng-zorro-antd/alert';

@Component({
  selector: 'app-my-shipments',
  standalone: true,
  imports: [
    CommonModule,
    NzTableModule, NzTagModule, NzButtonModule, NzIconModule,
    NzCardModule, NzSpinModule, NzPopconfirmModule,
    NzEmptyModule, NzToolTipModule, NzAlertModule,
  ],
  template: `
    <nz-card nzTitle="Mis Envíos">
      <nz-spin [nzSpinning]="loading">
        <nz-empty *ngIf="!loading && shipments.length === 0"
          nzNotFoundContent="No tienes envíos registrados aún.">
        </nz-empty>

        <nz-table
          *ngIf="shipments.length > 0"
          [nzData]="shipments"
          nzSize="middle"
          [nzPageSize]="15">
          <thead>
            <tr>
              <th>Despacho</th>
              <th>Productos</th>
              <th>Costo envío</th>
              <th>Estado</th>
              <th>Tracking</th>
              <th>Fecha</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of shipments">
              <td>
                <span style="font-family:monospace;font-size:12px">
                  #{{ s.id?.slice(-6)?.toUpperCase() }}
                </span>
              </td>
              <td>
                <div *ngFor="let item of s.itemSummary" style="font-size:12px;line-height:1.6">
                  {{ item.productName }} <span style="color:#aaa">({{ item.variantLabel }})</span>
                  x{{ item.quantity }}
                </div>
              </td>
              <td>
                <span *ngIf="s.shippingCost != null">\${{ s.shippingCost | number:'1.2-2' }}</span>
                <span *ngIf="s.shippingCost == null" style="color:#aaa">—</span>
              </td>
              <td>
                <nz-tag [nzColor]="statusColor(s.status)">{{ statusLabel(s.status) }}</nz-tag>
              </td>
              <td>
                <a *ngIf="s.trackingUrl" [href]="s.trackingUrl" target="_blank">
                  <span nz-icon nzType="link"></span> Rastrear
                </a>
                <span *ngIf="!s.trackingUrl" style="color:#aaa">—</span>
              </td>
              <td>{{ s.createdAt?.toDate() | date:'dd/MM/yyyy' }}</td>
              <td>
                <button
                  *ngIf="s.status === 'sent'"
                  nz-button nzType="primary" nzSize="small"
                  nz-popconfirm
                  nzPopconfirmTitle="¿Confirmas que recibiste este envío?"
                  (nzOnConfirm)="confirmDelivery(s)">
                  <span nz-icon nzType="check"></span> Confirmar recepción
                </button>
                <span *ngIf="s.status === 'open'" style="color:#aaa;font-size:12px">
                  Pendiente de despacho
                </span>
                <span *ngIf="s.status === 'delivered'" style="color:#52c41a;font-size:12px">
                  <span nz-icon nzType="check-circle"></span> Recibido
                </span>
              </td>
            </tr>
          </tbody>
        </nz-table>
      </nz-spin>
    </nz-card>
  `,
})
export class MyShipmentsComponent implements OnInit, OnDestroy {
  private shipmentService = inject(ShipmentService);
  private usersService = inject(UsersService);
  private message = inject(NzMessageService);

  private destroy$ = new Subject<void>();

  shipments: Shipment[] = [];
  loading = true;

  ngOnInit(): void {
    this.usersService.user$.pipe(
      filter(u => !!u && !u.isAnonymous),
      take(1)
    ).subscribe(u => {
      this.shipmentService.getShipmentsByDistributor(u!.uid)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: s => { this.shipments = s; this.loading = false; },
          error: () => { this.loading = false; }
        });
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  statusColor(status: string): string {
    return { open: 'blue', sent: 'orange', delivered: 'green' }[status] || 'default';
  }

  statusLabel(status: string): string {
    return { open: 'Pendiente despacho', sent: 'En camino', delivered: 'Entregado' }[status] || status;
  }

  async confirmDelivery(s: Shipment): Promise<void> {
    if (!s.id) return;
    try {
      await this.shipmentService.confirmDelivery(s.id);
      this.message.success('¡Recepción confirmada! Gracias.');
    } catch (e: any) {
      this.message.error(`Error: ${e.message}`);
    }
  }
}
