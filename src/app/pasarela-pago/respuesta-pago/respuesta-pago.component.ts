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

  private token = 'Bearer sicBfX1A8I_J2eF2sl1BAY_Tk4YTrjOl8DgiuDchpBa1eVp9T-WCVpWMBByjquFbE-QGu9FZUcO_niECpZFpy8uvFqYt4G1wPemawp8O347sRvo9vR4F1ZHJ38_gZSGuLdKru7aXfaiTqjd6Bhw6myT0wJbxvB-1Vp_Pqv-6nK_q1_rjwhdALEnelqCri3S5xjHdTFk2uQQQMUcs027FeiDcvpnEwVW1A2yv-x0ciaTxRk_7fh2QqddhOW7KglFbKGBs6ZQLp5Du6KSns1kiK7TX1bXbngXJIHvWVPlVIngnBbpaB7vTQ0V5uNJnj0S2D_uI61zwgCMnCZlMJIAkjjjdYBY'; // 👈 Token real

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