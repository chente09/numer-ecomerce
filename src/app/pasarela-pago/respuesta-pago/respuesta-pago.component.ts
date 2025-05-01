import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-respuesta-pago',
  imports: [CommonModule, RouterLink],
  templateUrl: './respuesta-pago.component.html',
  styleUrl: './respuesta-pago.component.css'
})
export class RespuestaPagoComponent implements OnInit{
  estado: 'aprobado' | 'cancelado' | 'error' | null = null;
  mensaje = '';
  detalle: any = null;

  private token = 'Bearer LtBftB0D9H2Naod9iwTNv_FD6jCLDUNalhv2-YoKg3G08YEN1Rugek2NqxMa5qppcM90tDJwvej5fRkVKGHoQY-xlXLY_eUFIRaGwAVJWl9hsssAFsIGfUhaX2zeChWvta-OGGu6ruNXpBQ93YVFrRIRMvmyZcJ5tkOPS6PXy3KtGE1vdIvnXlaIyR0O-NVgy3CwauH84j3nshSYKSqHDSuZnFNyAOkYKmo6k3SkSzIPkO1PMSVE0ezy8Wf6lsD0BmYjNAj5YqMShBebjhAk44nA0OZfUUONJhsQmkc4CV8KA6-1cwrHpuVdWYWeN2ksD2aiY_jjQtLTtHVRZ8ra58fqMIQ'; // 👈 Token real

  constructor(private route: ActivatedRoute, private http: HttpClient) {}

  ngOnInit(): void {
    const id = this.route.snapshot.queryParamMap.get('id');
    const clientTxId = this.route.snapshot.queryParamMap.get('clientTransactionId');

    if (id && clientTxId) {
      const headers = new HttpHeaders({
        'Authorization': this.token,
        'Content-Type': 'application/json'
      });

      this.http.post('https://pay.payphonetodoesposible.com/api/button/V2/Confirm', {
        id: +id,
        clientTxId: clientTxId
      }, { headers }).subscribe({
        next: (res: any) => {
          this.detalle = res;
          if (res.statusCode === 3) {
            this.estado = 'aprobado';
            this.mensaje = '✅ ¡Pago aprobado correctamente!';
          } else if (res.statusCode === 2) {
            this.estado = 'cancelado';
            this.mensaje = '⚠️ El pago fue cancelado.';
          } else {
            this.estado = 'error';
            this.mensaje = '❌ No se pudo verificar el estado del pago.';
          }
        },
        error: err => {
          this.estado = 'error';
          this.mensaje = '❌ Error al conectar con PayPhone: ' + err.message;
        }
      });
    } else {
      this.estado = 'error';
      this.mensaje = '❌ Faltan parámetros de la transacción en la URL.';
    }
  }

  imprimirTicket() {
    const contenido = document.getElementById('ticket')?.innerHTML;
    if (contenido) {
      const ventana = window.open('', '_blank', 'width=600,height=800');
      ventana?.document.write(`
        <html>
          <head>
            <title>Ticket de Compra</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h4 { text-align: center; }
              p { margin: 5px 0; }
              hr { margin: 10px 0; }
            </style>
          </head>
          <body onload="window.print(); window.close();">
            ${contenido}
          </body>
        </html>
      `);
      ventana?.document.close();
    }
  }
  
}