import { Component, ElementRef, Input, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HeroService, HeroItem } from '../../services/admin/hero/hero.service';
import { Product, Color, Review } from '../../models/models';
import { ScrollService } from '../../services/scroll/scroll.service';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzCarouselModule } from 'ng-zorro-antd/carousel';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { interval, Subject, Subscription } from 'rxjs';
import { NzInputModule } from 'ng-zorro-antd/input';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SafeStyle } from '@angular/platform-browser';
import { ChangeDetectorRef } from '@angular/core';
import { ReviewService } from '../../services/review/review.service';
import { animate, style, transition, trigger } from '@angular/animations';
import { CategoriasComponent } from '../../components/categorias/categorias.component';
import { GeneroSectionComponent } from "../../components/genero-section/genero-section.component";
import { ProductosSectionComponent } from "../../components/productos-section/productos-section.component";

interface InstagramComment {
  username: string;
  text: string;
  timestamp?: Date;
}

interface InstagramPost {
  id: number;
  imageUrl: string;
  caption: string;
  likes: number;
  liked: boolean;
  username?: string;
  userAvatar?: string;
  comments: InstagramComment[];
}



@Component({
  selector: 'app-welcome',
  imports: [
    CommonModule,
    NzCarouselModule,
    NzAvatarModule,
    RouterLink,
    NzSpinModule,
    NzCardModule,
    NzGridModule,
    NzIconModule,
    NzButtonModule,
    NzTagModule,
    NzTabsModule,
    NzInputModule,
    FormsModule,
    NzTypographyModule,
    NzModalModule,
    NzRateModule,
    CategoriasComponent,
    GeneroSectionComponent,
    ProductosSectionComponent
],
  standalone: true,
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css',
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('500ms ease-out', style({ opacity: 1 }))
      ])
    ])
  ]
})
export class WelcomeComponent implements OnInit, OnDestroy {
  categoriesLoading = true;
  loading: any;
  instagramFeed: InstagramPost[] = [];
  selectedPost: InstagramPost | null = null;
  newComment: string = '';
  testimonials: Review[] = [];
  private subscriptions: Subscription = new Subscription();
  testimonialsLoading = true;

  activeHero: HeroItem | null = null;
  private subscription: Subscription = new Subscription();

  @ViewChild('postDetailModal') postDetailModal!: TemplateRef<any>;
  @ViewChild('commentInput') commentInput!: ElementRef;
  @ViewChild('resenas') resenasElement!: ElementRef;
  // Nuevas propiedades
  private countdownSubscription: Subscription | undefined;
  emailSubscription = '';

  heroTitle = 'Para las Montañas y Más Allá';
  heroSubtitle = 'Numer Equipment: Equipamiento innovador para deportes de aventura, senderismo y montaña.';
  ctaText = 'Ver Novedades';
  ctaLink = '/new-arrivals';

  heroBgImage: SafeStyle | null = null;
  heroMobileBgImage: SafeStyle | null = null;
  backgroundColor: string | null = null;
  textColor: string | null = null;
  isGif = false;

  // Para limpieza de suscripciones
  private destroy$ = new Subject<void>();

  navItems = [
    {
      icon: 'team',
      title: 'Embajadores',
      description: 'Conoce a nuestros embajadores',
      link: '/herencia'
    },
    {
      icon: 'trophy',
      title: 'ATLETAS',
      description: 'Conoce a nuestros atletas',
      link: '/atletas'
    },
    {
      icon: 'shop',
      title: 'Encuéntranos',
      description: 'Visítanos en nuestras tiendas',
      link: '/historias'
    },
    {
      icon: 'bulb',
      title: 'OBJETIVO',
      description: 'La búsqueda de la perfección',
      link: '/objetivo'
    }
  ];

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

  // Productos en tendencia
  trendingProducts = {
    mostPopular: [
      {
        id: 1,
        name: 'Sendero',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 199.99
      },
      {
        id: 2,
        name: 'Barranco',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 249.99
      },
      {
        id: 3,
        name: 'Aguacero',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 129.99
      },
      {
        id: 4,
        name: 'Sendero ',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 179.99
      }
    ],
    newArrivals: [
      {
        id: 5,
        name: 'Extra Ligero',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 499.99
      },
      {
        id: 6,
        name: 'Barranco',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 79.99
      },
      {
        id: 7,
        name: 'Aguacero',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 129.99
      },
      {
        id: 8,
        name: 'Sendero ',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 149.99
      }
    ],
    onSale: [
      {
        id: 9,
        name: 'Extra Ligero',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 899.99,
        originalPrice: 1099.99,
        discountPercentage: 18
      },
      {
        id: 10,
        name: 'Sendero',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 349.99,
        originalPrice: 449.99,
        discountPercentage: 22
      },
      {
        id: 11,
        name: 'Barranco',
        imageUrl: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png',
        price: 399.99,
        originalPrice: 499.99,
        discountPercentage: 20
      },
      {
        id: 12,
        name: 'Aguacero',
        imageUrl: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png',
        price: 599.99,
        originalPrice: 749.99,
        discountPercentage: 20
      }
    ]
  };

  

  constructor(
    private heroService: HeroService,
    private reviewService: ReviewService,
    private modalService: NzModalService,
    private scrollService: ScrollService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) { }


  ngOnInit(): void {
    this.startCountdown();
    this.loadInstagramFeed();
    this.loadTestimonials();
    this.startPeriodicTestimonialsUpdate();
    this.subscription.add(
      this.heroService.getActiveHero().subscribe(async hero => {
        // Precargar imágenes antes de actualizar el componente
        if (hero) {
          await this.preloadHeroImages(hero);
        }

        this.activeHero = hero;

        // Actualizar estilos de fondo
        this.updateHeroStyles(hero);

        // Forzar la detección de cambios para actualizar la vista
        this.cdr.detectChanges();
      })
    );
  }

  /**
   * Método para precargar las imágenes de productPairs
   */

  ngOnDestroy() {
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
    }

    // Limpiar la suscripción para evitar memory leaks
    this.subscription.unsubscribe();
    this.subscriptions.unsubscribe();

    // Limpiar variables CSS
    document.documentElement.style.removeProperty('--mobile-image');
  }

  ngAfterViewInit() {
    // Manejar navegación por fragmentos
    this.route.fragment.subscribe(fragment => {
      if (fragment) {
        setTimeout(() => {
          this.scrollToSection(fragment);
        }, 100);
      }
    });
  }

  scrollToSection(sectionId: string) {
    // Usar el servicio de scroll para navegar a la sección
    if (sectionId === 'resenas' && this.resenasElement) {
      this.scrollService.scrollToElement(this.resenasElement);
      return;
    }

    this.scrollService.scrollToElementById(sectionId);
  }

  // En WelcomeComponent
  preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!url) {
        resolve();
        return;
      }

      const img = new Image();
      img.onload = () => resolve();
      img.onerror = (err) => {
        console.error('Error precargando imagen:', err);
        resolve(); // Resolver de todas formas para no bloquear
      };
      img.src = url;
    });
  }

  async preloadHeroImages(hero: HeroItem): Promise<void> {
    if (!hero) return;

    // Precargar imagen principal
    if (hero.imageUrl) {
      await this.preloadImage(hero.imageUrl);
    }

    // Precargar imagen móvil si existe
    if (hero.mobileImageUrl) {
      await this.preloadImage(hero.mobileImageUrl);
    }
  }

  updateHeroStyles(hero: HeroItem | null): void {
    if (!hero) return;

    // Actualizar estilos CSS para las imágenes
    if (hero.imageUrl) {
      document.documentElement.style.setProperty(
        '--hero-image',
        `url('${hero.imageUrl}')`
      );
    } else {
      document.documentElement.style.removeProperty('--hero-image');
    }

    if (hero.mobileImageUrl) {
      document.documentElement.style.setProperty(
        '--mobile-image',
        `url('${hero.mobileImageUrl}')`
      );
    } else {
      document.documentElement.style.removeProperty('--mobile-image');
    }

    // Actualizar colores de fondo y texto
    if (hero.backgroundColor) {
      document.documentElement.style.setProperty(
        '--hero-background-color',
        hero.backgroundColor
      );
    } else {
      document.documentElement.style.removeProperty('--hero-background-color');
    }

    if (hero.textColor) {
      document.documentElement.style.setProperty(
        '--hero-text-color',
        hero.textColor
      );
    } else {
      document.documentElement.style.removeProperty('--hero-text-color');
    }

    // Establecer clase para GIF si es necesario
    this.isGif = hero.isGif || false;
  }

  // Método para seleccionar un color de producto
  selectColor(product: Product, color: Color): void {
    product.imageUrl = color.imageUrl ?? product.imageUrl;
  }

  // Método para generar array para mostrar las estrellas de rating
  getStarsArray(rating: number): number[] {
    return Array(5).fill(0).map((_, i) => i < Math.floor(rating) ? 1 : 0);
  }



  /**
   * Método para precargar imágenes con mejor manejo de errores
   */
  

  /**
 * Método para obtener la URL de imagen con fallback
 */
  getImageUrl(product: any): string {
    return product.image || 'assets/images/product-placeholder.png';
  }

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

  loadTestimonials(): void {
    console.log('Iniciando carga de testimonios en WelcomeComponent');
    this.testimonialsLoading = true;

    const testimonialsSub = this.reviewService.getApprovedReviews(4)
      .subscribe({
        next: (reviews: Review[]) => {
          console.log('Testimonios recibidos en WelcomeComponent:', reviews);
          if (reviews && reviews.length > 0) {
            this.testimonials = reviews;
          } else {
            console.log('No hay testimonios disponibles, usando estáticos');
            this.setStaticTestimonials();
          }
          this.testimonialsLoading = false;
        },
        error: (err: Error) => {
          console.error('Error al cargar testimonios en WelcomeComponent:', err);
          this.setStaticTestimonials();
          this.testimonialsLoading = false;
        }
      });

    this.subscriptions.add(testimonialsSub);
  }

  startPeriodicTestimonialsUpdate(): void {
    // Actualizar los testimonios cada 5 minutos
    const updateInterval = 5 * 60 * 1000; // 5 minutos en milisegundos

    const intervalSub = interval(updateInterval).subscribe(() => {
      // Recargar los testimonios silenciosamente (sin mostrar loading)
      this.reviewService.getApprovedReviews(4).subscribe({
        next: (reviews: Review[]) => { // Tipo explícito para 'reviews'
          if (reviews && reviews.length > 0) {
            this.testimonials = reviews;
          }
        },
        error: (err: Error) => { // Tipo explícito para 'error'
          console.error('Error al actualizar testimonios:', err);
          // No hacer nada en caso de error, mantener los testimonios actuales
        }
      });
    });

    this.subscriptions.add(intervalSub);
  }

  // Método de respaldo con testimonios estáticos
  setStaticTestimonials(): void {
    this.testimonials = [
      {
        name: 'María González',
        location: 'Quito',
        rating: 5,
        text: 'Increíble experiencia de compra. Productos de alta calidad y un servicio al cliente excepcional. Definitivamente volveré a comprar aquí.',
        avatarUrl: 'https://i.postimg.cc/ncHk5s9m/Dise-o-sin-t-tulo-1.png',
        approved: true,
        createdAt: new Date('2023-09-01')
      },
      {
        name: 'Carlos Rodríguez',
        location: 'Loja',
        rating: 5,
        text: 'He realizado varias compras y siempre he quedado muy satisfecho. Envío rápido y productos exactamente como se describen.',
        avatarUrl: 'https://i.postimg.cc/qM5m65P4/image.png',
        approved: true,
        createdAt: new Date('2023-09-01')
      },
      {
        name: 'Laura Martínez',
        location: 'Cuenca',
        rating: 4,
        text: 'Gran selección de productos y precios muy competitivos. El proceso de compra es sencillo y la entrega fue rápida.',
        avatarUrl: 'https://i.postimg.cc/ncHk5s9m/Dise-o-sin-t-tulo-1.png',
        approved: true,
        createdAt: new Date('2023-09-01')
      }
    ];
  }


  subscribeToNewsletter() {
    if (this.emailSubscription && this.validateEmail(this.emailSubscription)) {
      // Aquí iría la lógica para guardar el email en la base de datos
      console.log('Email suscrito:', this.emailSubscription);
      alert('¡Gracias por suscribirte a nuestro newsletter!');
      this.emailSubscription = '';
    } else {
      alert('Por favor, introduce un email válido.');
    }
  }

  validateEmail(email: string): boolean {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(String(email).toLowerCase());
  }

  loadInstagramFeed(): void {
    // Aquí puedes cargar datos reales de una API
    this.instagramFeed = [
      {
        id: 1,
        imageUrl: 'https://i.postimg.cc/RZNyyyFQ/53894.jpg',
        caption: 'Nuestros nuevos productos ya están disponibles en tienda. ¡No te los pierdas! #NumerEC #NuevaColeccion',
        likes: 124,
        liked: false,
        username: 'numer.ec',
        userAvatar: 'https://i.postimg.cc/7LgKRbyJ/Logo-Numer-negro.png',
        comments: [
          { username: 'usuario1', text: '¡Me encanta esta colección!' },
          { username: 'usuario2', text: '¿Cuándo tendrán disponible la talla M?' }
        ]
      },
      {
        id: 2,
        imageUrl: 'https://i.postimg.cc/ZYXTw8jQ/bg.jpg',
        caption: 'Descubre nuestras promociones de temporada. #Ofertas #NumerEC',
        likes: 89,
        liked: false,
        username: 'numer.ec',
        userAvatar: 'https://i.postimg.cc/7LgKRbyJ/Logo-Numer-negro.png',
        comments: [
          { username: 'usuario3', text: '¡Excelentes precios!' }
        ]
      },
      {
        id: 3,
        imageUrl: 'https://i.postimg.cc/RZNyyyFQ/53894.jpg',
        caption: 'Inspiración para tu próximo outfit. #ModoFashion #NumerEC',
        likes: 215,
        liked: false,
        username: 'numer.ec',
        userAvatar: 'https://i.postimg.cc/7LgKRbyJ/Logo-Numer-negro.png',
        comments: []
      },
      {
        id: 4,
        imageUrl: 'https://i.postimg.cc/ZYXTw8jQ/bg.jpg',
        caption: 'Estilo y confort en una sola prenda. #NumerEC #Tendencias',
        likes: 167,
        liked: false,
        username: 'numer.ec',
        userAvatar: 'https://i.postimg.cc/7LgKRbyJ/Logo-Numer-negro.png',
        comments: [
          { username: 'usuario4', text: '¿Tienen envíos a Cuenca?' },
          { username: 'numer.ec', text: '¡Claro! Envíos a todo el país.' }
        ]
      },
      {
        id: 5,
        imageUrl: 'https://i.postimg.cc/RZNyyyFQ/53894.jpg',
        caption: 'Lo más vendido de la semana. #Bestsellers #NumerEC',
        likes: 94,
        liked: false,
        username: 'numer.ec',
        userAvatar: 'https://i.postimg.cc/7LgKRbyJ/Logo-Numer-negro.png',
        comments: []
      },
      {
        id: 6,
        imageUrl: 'https://i.postimg.cc/ZYXTw8jQ/bg.jpg',
        caption: 'Complementos perfectos para cada ocasión. #Accesorios #NumerEC',
        likes: 142,
        liked: false,
        username: 'numer.ec',
        userAvatar: 'https://i.postimg.cc/7LgKRbyJ/Logo-Numer-negro.png',
        comments: [
          { username: 'usuario5', text: '¿Tienen envíos a Cuenca?' }
        ]
      }
    ];
  }

  openPostModal(post: InstagramPost): void {
    this.selectedPost = { ...post }; // Creamos una copia para no modificar el original directamente

    this.modalService.create({
      nzContent: this.postDetailModal,
      nzFooter: null,
      nzWidth: '900px',
      nzClassName: 'instagram-modal',
      nzCentered: true,
      nzClosable: true,
      nzMaskClosable: true
    });
  }

  toggleLike(post: InstagramPost): void {
    if (post.liked) {
      post.likes--;
      post.liked = false;
    } else {
      post.likes++;
      post.liked = true;
    }

    // Aquí puedes implementar la llamada a la API para actualizar el like

    // También actualiza el post original en el feed
    if (this.selectedPost) {
      const originalPost = this.instagramFeed.find(p => p.id === post.id);
      if (originalPost) {
        originalPost.likes = post.likes;
        originalPost.liked = post.liked;
      }
    }
  }

  addComment(): void {
    if (!this.newComment.trim() || !this.selectedPost) return;

    const newComment: InstagramComment = {
      username: 'tú', // O podrías usar el nombre del usuario actual
      text: this.newComment.trim(),
      timestamp: new Date()
    };

    this.selectedPost.comments.push(newComment);

    // Actualiza el post original en el feed
    const originalPost = this.instagramFeed.find(p => p.id === this.selectedPost?.id);
    if (originalPost) {
      originalPost.comments = [...this.selectedPost.comments];
    }

    // Aquí puedes implementar la llamada a la API para guardar el comentario

    this.newComment = '';
  }

  focusCommentInput(): void {
    setTimeout(() => {
      this.commentInput?.nativeElement?.focus();
    }, 0);
  }

}
