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

/** Datos para armar un comprobante; salen de un pedido guardado y, si hace falta, de la respuesta de Payphone. */
export interface ReceiptInput {
  orderId: string;
  date: Date | null;
  transactionId?: string | number | null;
  authorizationCode?: string | null;
  currency?: string | null;
  reference?: string | null;
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
const LOGO_MAX_PX = 320; // el logo original pesa ~2 MB sin comprimir dentro de un PDF; así queda en pocos KB

@Injectable({ providedIn: 'root' })
export class ReceiptService {
  private orderService = inject(OrderService);

  /**
   * Comprobante justo después de pagar: usa el pedido guardado (con productos y desglose) y completa
   * lo que falte con el resultado de Payphone, para que el cliente nunca se quede sin él.
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

    const fromPayment = this.fromPayment(clientTxId, payment);
    if (!order) {
      await this.download(fromPayment);
      return;
    }
    const fromOrder = this.fromOrder(order);
    await this.download({
      ...fromOrder,
      transactionId: fromOrder.transactionId ?? fromPayment.transactionId,
      authorizationCode: fromOrder.authorizationCode || fromPayment.authorizationCode,
      currency: fromOrder.currency || fromPayment.currency,
      reference: fromOrder.reference || fromPayment.reference,
      paymentMethod: fromOrder.paymentMethod && fromOrder.paymentMethod !== 'Payphone'
        ? fromOrder.paymentMethod
        : (fromPayment.paymentMethod || fromOrder.paymentMethod),
      customerEmail: fromOrder.customerEmail || fromPayment.customerEmail
    });
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
      authorizationCode: order.payment?.authorizationCode || null,
      currency: order.payment?.currency || 'USD',
      reference: order.payment?.reference || null,
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

  private fromPayment(clientTxId: string, payment: any): ReceiptInput {
    const card = payment?.cardBrand
      ? `${payment.cardBrand}${payment.lastDigits ? ' **** ' + payment.lastDigits : ''}`
      : 'Payphone';
    return {
      orderId: clientTxId || String(payment?.clientTransactionId || payment?.transactionId || ''),
      date: payment?.date ? new Date(payment.date) : new Date(),
      transactionId: payment?.transactionId ?? null,
      authorizationCode: payment?.authorizationCode || null,
      currency: payment?.currency || 'USD',
      reference: payment?.reference || null,
      paymentMethod: card,
      customerEmail: payment?.email || null,
      items: [],
      total: (payment?.amount || 0) / 100
    };
  }

  /** Genera el PDF y lo descarga (funciona también en el teléfono, a diferencia de imprimir). */
  async download(input: ReceiptInput): Promise<void> {
    // jsPDF pesa bastante: se carga solo cuando el cliente pulsa "Descargar".
    const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), this.loadLogo()]);

    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 18;
    const CX = W / 2;
    let y = 14;

    const money = (n: number | null | undefined) =>
      new Intl.NumberFormat('es-EC', { style: 'currency', currency: input.currency || 'USD' })
        .format(n ?? 0).replace(/ /g, ' ');

    const ensureSpace = (needed: number) => {
      if (y + needed > H - 18) {
        doc.addPage();
        y = M;
      }
    };

    // ── Encabezado centrado ──
    if (logo) {
      const h = 21;
      doc.addImage(logo.dataUrl, 'PNG', CX - (h * logo.ratio) / 2, y, h * logo.ratio, h, undefined, 'FAST');
    }
    y += 26;
    doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(0, 0, 0);
    doc.text(COMPANY.name, CX, y, { align: 'center' });
    y += 5.5;
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(100, 100, 100);
    [COMPANY.address, `Teléfono: ${COMPANY.phone}`, `Email: ${COMPANY.email}`, `RUC: ${COMPANY.ruc}`].forEach(line => {
      doc.text(line, CX, y, { align: 'center' });
      y += 4;
    });
    y += 3;
    doc.setDrawColor(0, 0, 0).setLineWidth(0.6).line(M, y, W - M, y);
    y += 9;

    // ── Título ──
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(130, 130, 130);
    doc.text('COMPROBANTE DE PAGO ELECTRÓNICO', CX, y, { align: 'center', charSpace: 0.5 });
    y += 8;

    // ── Caja de estado ──
    doc.setDrawColor(0, 0, 0).setLineWidth(0.35).rect(M, y, W - 2 * M, 10);
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(40, 140, 60);
    doc.text('Aprobado', CX, y + 6.6, { align: 'center' });
    y += 15;

    // ── Caja del total ──
    doc.setDrawColor(0, 0, 0).setLineWidth(0.7).rect(M, y, W - 2 * M, 18);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(80, 80, 80);
    doc.text('TOTAL PAGADO', CX, y + 6, { align: 'center' });
    doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(0, 0, 0);
    doc.text(money(input.total), CX, y + 14, { align: 'center' });
    y += 25;

    // ── Filas de detalle: etiqueta a la izquierda, valor a la derecha, separador punteado ──
    const date = input.date
      ? input.date.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'medium' })
      : null;
    const rows: [string, string | null | undefined][] = [
      ['ID Transacción', input.transactionId != null ? String(input.transactionId) : null],
      ['Pedido', input.orderId],
      ['Fecha y Hora', date],
      ['Código de Autorización', input.authorizationCode],
      ['Moneda', input.currency || 'USD'],
      ['Referencia', input.reference],
      ['Método de Pago', input.paymentMethod],
      ['Cliente', input.customerName],
      ['Email', input.customerEmail],
      ['Dirección de envío', input.shippingAddress]
    ];
    const valueMaxW = W - 2 * M - 62;
    doc.setLineDashPattern([0.5, 0.7], 0);
    for (const [label, value] of rows) {
      if (!value) continue;
      const lines = doc.splitTextToSize(String(value), valueMaxW) as string[];
      ensureSpace(lines.length * 4.6 + 6);
      doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(85, 85, 85).text(label + ':', M, y);
      doc.setFont('helvetica', 'normal').setTextColor(0, 0, 0).text(lines, W - M, y, { align: 'right' });
      y += (lines.length - 1) * 4.6 + 2.6;
      doc.setDrawColor(190, 190, 190).setLineWidth(0.2).line(M, y, W - M, y);
      y += 5.0;
    }
    doc.setLineDashPattern([], 0);
    y += 2;

    // ── Productos ──
    if (input.items.length > 0) {
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
      ensureSpace(24);
      drawTableHeader();

      doc.setFontSize(9);
      for (const item of input.items) {
        const title = item.variant ? `${item.name} (${item.variant})` : item.name;
        const lines = doc.splitTextToSize(title, colQty - M - 14) as string[];
        if (y + lines.length * 4.5 > H - 22) {
          doc.addPage();
          y = M + 4;
          drawTableHeader();
        }
        doc.setFont('helvetica', 'normal').setTextColor(0, 0, 0);
        doc.text(lines, M + 2, y);
        doc.text(String(item.quantity), colQty, y, { align: 'right' });
        doc.text(money(item.unitPrice), colUnit, y, { align: 'right' });
        doc.text(money(item.totalPrice), colTotal - 2, y, { align: 'right' });
        const lineY = y + (lines.length - 1) * 4.5 + 2.2;
        doc.setDrawColor(225, 225, 225).setLineWidth(0.2).line(M, lineY, W - M, lineY);
        y = lineY + 5.6;
      }
      y += 2;

      // ── Desglose ──
      const breakdown: [string, number | null | undefined][] = [
        ['Subtotal', input.subtotal],
        ['Descuento', input.discount ? -input.discount : null],
        ['IVA', input.tax],
        ['Envío', input.shipping]
      ];
      ensureSpace(34);
      for (const [label, value] of breakdown) {
        if (value == null) continue;
        doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90, 90, 90).text(label, colUnit - 10, y, { align: 'right' });
        doc.setTextColor(0, 0, 0).text(value < 0 ? `-${money(-value)}` : money(value), colTotal - 2, y, { align: 'right' });
        y += 5;
      }
      y += 5; // el total ya está en la caja grande de arriba
    }

    // ── Código de verificación ──
    if (input.transactionId != null) {
      ensureSpace(20);
      doc.setDrawColor(190, 190, 190).setLineWidth(0.3).rect(M, y, W - 2 * M, 14);
      doc.setFont('courier', 'bold').setFontSize(9).setTextColor(40, 40, 40);
      doc.text('Código de Verificación:', CX, y + 5.5, { align: 'center' });
      doc.setFont('courier', 'normal').setFontSize(9.5).text(String(input.transactionId), CX, y + 10.5, { align: 'center' });
    }

    // ── Pie ──
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130, 130, 130);
      doc.text('Gracias por tu compra. Conserva este comprobante como respaldo de tu pedido.', CX, H - 12, { align: 'center' });
      doc.text(`Generado el ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}`, CX, H - 8, { align: 'center' });
      if (pages > 1) doc.text(`${p}/${pages}`, W - M, H - 8, { align: 'right' });
    }

    doc.save(`comprobante-${input.orderId}.pdf`);
  }

  /** Carga el logo y lo reduce: incrustado a tamaño completo hacía pesar al PDF más de 2 MB. */
  private async loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
    try {
      const response = await fetch(LOGO_URL);
      if (!response.ok) return null;
      const blob = await response.blob();
      const source: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const img: HTMLImageElement = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = source;
      });

      const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { dataUrl: canvas.toDataURL('image/png'), ratio: canvas.width / canvas.height };
    } catch {
      return null; // el comprobante se genera igual, sin logo
    }
  }
}
