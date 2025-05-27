import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-promociones-section',
  imports: [
    CommonModule,
    NzGridModule
  ],
  templateUrl: './promociones-section.component.html',
  styleUrl: './promociones-section.component.css'
})
export class PromocionesSectionComponent implements OnInit, OnDestroy {
  private countdownSubscription: Subscription | undefined;
  

  constructor() { }

  ngOnInit(): void {
    this.startCountdown();
  }

  ngOnDestroy() {
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
    }
  }
  // Ofertas limitadas
    limitedOffers = [
      {
        title: 'Pantalón Extra Ligero',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        originalPrice: 58,
        currentPrice: 38,
        discountPercentage: 20,
        countdown: {
          days: 2,
          hours: 14,
          minutes: 35,
          seconds: 22
        }
      },
      {
        title: 'Pantalón Barranco',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        originalPrice: 48,
        currentPrice: 38,
        discountPercentage: 23,
        countdown: {
          days: 1,
          hours: 8,
          minutes: 45,
          seconds: 11
        }
      }
    ];

    startCountdown() {
    // Actualizar el countdown cada segundo
    this.countdownSubscription = interval(1000).subscribe(() => {
      this.limitedOffers.forEach(offer => {
        // Reducir segundos
        offer.countdown.seconds--;

        // Ajustar minutos cuando los segundos llegan a -1
        if (offer.countdown.seconds < 0) {
          offer.countdown.seconds = 59;
          offer.countdown.minutes--;

          // Ajustar horas cuando los minutos llegan a -1
          if (offer.countdown.minutes < 0) {
            offer.countdown.minutes = 59;
            offer.countdown.hours--;

            // Ajustar días cuando las horas llegan a -1
            if (offer.countdown.hours < 0) {
              offer.countdown.hours = 23;
              offer.countdown.days--;

              // Si el contador llega a 0, reiniciar (opcional)
              if (offer.countdown.days < 0) {
                offer.countdown.days = 2;
                offer.countdown.hours = 0;
                offer.countdown.minutes = 0;
                offer.countdown.seconds = 0;
              }
            }
          }
        }
      });
    });
  }


}
