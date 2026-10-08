import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { Order } from '../../models/models';
import { OrderService } from '../order/order.service';

export interface ReceiptItem {
  name: string;
  variant?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

/** Datos mínimos para armar un comprobante; salen de un pedido guardado o de la respuesta de Payphone. */
export interface ReceiptInput {
  orderId: string;
  date: Date | null;
  transactionId?: string | number | null;
  paymentMethod?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  shippingAddress?: string | null;
  items: ReceiptItem[];
  subtotal?: number | null;
  discount?: number | null;
  tax?: number | null;
  shipping?: number | null;
  total: number;
}

const COMPANY = {
  name: 'NUMER',
  address: 'Iliniza S7 - 90, Quito 170121',
  phone: '+593 098 712 5801',
  email: 'numer.ec21@gmail.com',
  ruc: 'PENDIENTE'
};

const LOGO_URL = '/img/logo-negro.png';

@Injectable({ providedIn: 'root' })
export class ReceiptService {
  private orderService = inject(OrderService);

  /**
   * Comprobante justo después de pagar: usa el pedido guardado (con productos y desglose) y, si
   * todavía no se puede leer, el resultado de Payphone, para que el cliente nunca se quede sin él.
   */
  async downloadForPayment(clientTxId: string, payment: any): Promise<void> {
    let order: Order | undefined;
    try {
      order = clientTxId
        ? await firstValueFrom(this.orderService.getOrderById(clientTxId).pipe(timeout(6000)))
        : undefined;
    } catch {
      order = undefined;
    }
    await this.download(order ? this.fromOrder(order) : this.fromPayment(clientTxId, payment));
  }

  private fromPayment(clientTxId: string, payment: any): ReceiptInput {
    const card = payment?.cardBrand
      ? `${payment.cardBrand}${payment.lastDigits ? ' **** ' + payment.lastDigits : ''}`
      : 'Payphone';
    return {
      orderId: clientTxId || String(payment?.clientTransactionId || payment?.transactionId || ''),
      date: payment?.date ? new Date(payment.date) : new Date(),
      transactionId: payment?.transactionId ?? null,
      paymentMethod: card,
      customerEmail: payment?.email || null,
      items: [],
      total: (payment?.amount || 0) / 100
    };
  }

  /** Convierte un pedido guardado en los datos del comprobante. */
  fromOrder(order: Order): ReceiptInput {
    const created: any = order.createdAt;
    const date = created?.toDate ? created.toDate() : created ? new Date(created) : null;
    const card = order.payer?.cardBrand
      ? `${order.payer.cardBrand}${order.payer.lastDigits ? ' **** ' + order.payer.lastDigits : ''}`
      : null;

    return {
      orderId: order.orderId,
      date: date && !isNaN(date.getTime()) ? date : null,
      transactionId: order.transactionId ?? null,
      paymentMethod: card || (order.paymentMethod === 'payphone' ? 'Payphone' : order.paymentMethod || null),
      customerName: order.customerInfo?.name || null,
      customerEmail: order.customerInfo?.email || null,
      shippingAddress: order.shippingAddress?.formatted || null,
      items: (order.items || []).map(i => {
        const totalPrice = Number(i.totalPrice ?? 0);
        return {
          name: i.productName || 'Producto',
          variant: i.variant || undefined,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice ?? (i.quantity ? totalPrice / i.quantity : 0)),
          totalPrice
        };
      }),
      subtotal: order.subtotal ?? null,
      discount: order.discountAmount ?? null,
      tax: order.tax ?? null,
      shipping: order.shipping ?? null,
      total: order.total
    };
  }

  /** Genera el PDF y lo descarga (funciona también en el teléfono, a diferencia de imprimir). */
  async download(input: ReceiptInput): Promise<void> {
    // jsPDF pesa bastante: se carga solo cuando el cliente pulsa "Descargar".
    const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), this.loadLogo()]);

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 18;
    let y = M;

    const money = (n: number | null | undefined) =>
      new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n ?? 0).replace(/ /g, ' ');

    const ensureSpace = (needed: number) => {
      if (y + needed > H - 20) {
        doc.addPage();
        y = M;
      }
    };

    // ── Encabezado ──
    if (logo) {
      const h = 16;
      doc.addImage(logo.dataUrl, 'PNG', M, y, h * logo.ratio, h);
    }
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(0, 0, 0);
    doc.text(COMPANY.name, W - M, y + 5, { align: 'right' });
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(90, 90, 90);
    [COMPANY.address, `Teléfono: ${COMPANY.phone}`, `Email: ${COMPANY.email}`, `RUC: ${COMPANY.ruc}`]
      .forEach((line, i) => doc.text(line, W - M, y + 10 + i * 4, { align: 'right' }));
    y += 28;

    doc.setDrawColor(0, 0, 0).setLineWidth(0.6).line(M, y, W - M, y);
    y += 8;

    // ── Título y total ──
    doc.setFillColor(0, 0, 0).rect(M, y, W - 2 * M, 10, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(255, 255, 255);
    doc.text('COMPROBANTE DE PAGO ELECTRÓNICO', W / 2, y + 6.6, { align: 'center' });
    y += 17;

    doc.setTextColor(0, 0, 0).setFont('helvetica', 'bold').setFontSize(9).setTextColor(40, 140, 60);
    doc.text('PAGO APROBADO', M, y);
    doc.setTextColor(0, 0, 0).setFontSize(20);
    doc.text(money(input.total), W - M, y + 1, { align: 'right' });
    y += 10;

    // ── Datos del pedido ──
    const rows: [string, string | null | undefined][] = [
      ['Pedido', input.orderId],
      ['Fecha', input.date ? input.date.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'long', timeStyle: 'short' }) : null],
      ['ID de transacción', input.transactionId != null ? String(input.transactionId) : null],
      ['Método de pago', input.paymentMethod],
      ['Cliente', input.customerName],
      ['Email', input.customerEmail],
      ['Dirección de envío', input.shippingAddress]
    ];
    doc.setFontSize(9);
    for (const [label, value] of rows) {
      if (!value) continue;
      const lines = doc.splitTextToSize(String(value), W - 2 * M - 48) as string[];
      ensureSpace(lines.length * 4.5 + 3);
      doc.setFont('helvetica', 'bold').setTextColor(90, 90, 90).text(label, M, y);
      doc.setFont('helvetica', 'normal').setTextColor(0, 0, 0).text(lines, M + 48, y);
      y += lines.length * 4.5 + 1.5;
    }
    y += 4;

    // ── Productos ──
    const hasItems = input.items.length > 0;
    const colQty = W - M - 62;
    const colUnit = W - M - 32;
    const colTotal = W - M;
    const drawTableHeader = () => {
      doc.setFillColor(240, 240, 240).rect(M, y - 4.5, W - 2 * M, 7, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(60, 60, 60);
      doc.text('PRODUCTO', M + 2, y);
      doc.text('CANT.', colQty, y, { align: 'right' });
      doc.text('P. UNIT.', colUnit, y, { align: 'right' });
      doc.text('TOTAL', colTotal - 2, y, { align: 'right' });
      y += 7;
    };
    if (hasItems) {
      ensureSpace(20);
      drawTableHeader();
    }

    doc.setFontSize(9);
    for (const item of input.items) {
      const title = item.variant ? `${item.name} (${item.variant})` : item.name;
      const lines = doc.splitTextToSize(title, colQty - M - 14) as string[];
      if (y + lines.length * 4.5 > H - 20) {
        doc.addPage();
        y = M + 4;
        drawTableHeader();
      }
      doc.setFont('helvetica', 'normal').setTextColor(0, 0, 0);
      doc.text(lines, M + 2, y);
      doc.text(String(item.quantity), colQty, y, { align: 'right' });
      doc.text(money(item.unitPrice), colUnit, y, { align: 'right' });
      doc.text(money(item.totalPrice), colTotal - 2, y, { align: 'right' });
      // Separador entre las filas, con margen para que no toque el texto de la siguiente
      const lineY = y + (lines.length - 1) * 4.5 + 2.2;
      doc.setDrawColor(225, 225, 225).setLineWidth(0.2).line(M, lineY, W - M, lineY);
      y = lineY + 5.6;
    }
    y += 2;

    // ── Totales ──
    const totals: [string, number | null | undefined, boolean?][] = [
      ['Subtotal', input.subtotal],
      ['Descuento', input.discount ? -input.discount : null],
      ['IVA', input.tax],
      ['Envío', input.shipping]
    ];
    ensureSpace(34);
    for (const [label, value] of totals) {
      if (value == null) continue;
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90, 90, 90).text(label, colUnit - 10, y, { align: 'right' });
      doc.setTextColor(0, 0, 0).text(value < 0 ? `-${money(-value)}` : money(value), colTotal - 2, y, { align: 'right' });
      y += 5;
    }
    doc.setDrawColor(0, 0, 0).setLineWidth(0.5).line(colUnit - 40, y - 1.5, W - M, y - 1.5);
    y += 3;
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(0, 0, 0);
    doc.text('TOTAL PAGADO', colUnit - 10, y, { align: 'right' });
    doc.text(money(input.total), colTotal - 2, y, { align: 'right' });

    // ── Pie ──
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120, 120, 120);
    doc.text('Gracias por tu compra. Conserva este comprobante como respaldo de tu pedido.', W / 2, H - 14, { align: 'center' });
    doc.text(`Generado el ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}`, W / 2, H - 10, { align: 'center' });

    doc.save(`comprobante-${input.orderId}.pdf`);
  }

  private async loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
    try {
      const response = await fetch(LOGO_URL);
      if (!response.ok) return null;
      const blob = await response.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const ratio: number = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
        img.onerror = () => resolve(1);
        img.src = dataUrl;
      });
      return { dataUrl, ratio };
    } catch {
      return null; // el comprobante se genera igual, sin logo
    }
  }
}
