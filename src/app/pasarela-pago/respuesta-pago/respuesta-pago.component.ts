import { CommonModule, Location } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-respuesta-pago',
  imports: [CommonModule],
  templateUrl: './respuesta-pago.component.html',
  styleUrl: './respuesta-pago.component.css'
})
export class RespuestaPagoComponent implements OnInit{
  resultado: any = null;
  error: any = null;
  loading = true;
  public currencyCode = 'USD'; 

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private location: Location     
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const id = +params['id'] || 0;
      const clientTxId = params['clientTransactionId'] || '';

      this.http.post<any>(
        'https://backend-numer.netlify.app/.netlify/functions/confirmacion',
        { id, clientTxId }
      ).subscribe({
        next: res => {
          this.resultado = res;
          this.currencyCode = res.currency || this.currencyCode;
          this.loading = false;
        },
        error: err => {
          this.error = err.error || err;
          this.loading = false;
        }
      });
    });
  }

  /** Devuelve un estado amigable y traducido */
  get friendlyStatus(): string {
    const status = this.resultado?.transactionStatus;
    switch (status) {
      case 'Approved':
        return 'Aprobado';
      case 'Canceled':
      case 'Cancelled':
        return 'Cancelado';
      case 'Error':
        return 'Error en la transacción';
      default:
        return status || '';
    }
  }

  /** Indica si la transacción fue cancelada */
  isCanceled(): boolean {
    const s = this.resultado?.transactionStatus;
    return s === 'Canceled' || s === 'Cancelled';
  }

  goBack(): void {
    this.location.back();
  }


  printTicket(): void {
    window.print();
  }
}