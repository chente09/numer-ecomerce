import { Component, ElementRef, Input, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CategoryService, Category } from '../../services/category/category.service';
import { ProductService, Product, Color } from '../../services/product/product.service';
import { ScrollService } from '../../services/scroll/scroll.service';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzCarouselModule } from 'ng-zorro-antd/carousel';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { interval, Subscription } from 'rxjs';
import { NzInputModule } from 'ng-zorro-antd/input';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { NzMessageService } from 'ng-zorro-antd/message';

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

interface ProductPair {
  image: string;
  title: string;
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
    NzRateModule
  ],
  standalone: true,
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css'
})
export class WelcomeComponent implements OnInit, OnDestroy {
  categories: Category[] = [];
  featuredProducts: Product[] = [];
  categoriesLoading = true;
  productsLoading = true;
  allProducts: Product[] = [];
  loading: any;
  instagramFeed: InstagramPost[] = [];
  selectedPost: InstagramPost | null = null;
  newComment: string = '';

  hoveredCategorySlug: string | null = null;

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

  // Dentro de la clase WelcomeComponent, agrega esta propiedad:
  productPairs: ProductPair[] = [
    {
      title: 'Hombre',
      image: 'https://i.postimg.cc/3wM0s6fq/VERDE-PINO.png'
    },
    {
      title: 'Mujer',
      image: 'https://i.postimg.cc/L578zYrW/MENTA-GRIS.png'
    }
  ];

  // Testimonios
  testimonials = [
    {
      name: 'María González',
      location: 'Quito',
      rating: 5,
      text: 'Increíble experiencia de compra. Productos de alta calidad y un servicio al cliente excepcional. Definitivamente volveré a comprar aquí.',
      avatarUrl: 'https://i.postimg.cc/ncHk5s9m/Dise-o-sin-t-tulo-1.png'
    },
    {
      name: 'Carlos Rodríguez',
      location: 'Loja',
      rating: 5,
      text: 'He realizado varias compras y siempre he quedado muy satisfecho. Envío rápido y productos exactamente como se describen.',
      avatarUrl: 'https://i.postimg.cc/qM5m65P4/image.png'
    },
    {
      name: 'Laura Martínez',
      location: 'Cuenca',
      rating: 4,
      text: 'Gran selección de productos y precios muy competitivos. El proceso de compra es sencillo y la entrega fue rápida.',
      avatarUrl: 'https://i.postimg.cc/ncHk5s9m/Dise-o-sin-t-tulo-1.png'
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
    private categoryService: CategoryService,
    private productService: ProductService,
    private modalService: NzModalService,
    private scrollService: ScrollService,
    private route: ActivatedRoute,
    private message: NzMessageService
  ) { }


  ngOnInit(): void {
    this.loadCategories();
    this.loadFeaturedProducts();
    this.startCountdown();
    this.loadInstagramFeed();
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

  ngOnDestroy() {
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
    }
  }

  // Método para seleccionar un color de producto
  selectColor(product: Product, color: Color): void {
    product.imageUrl = color.imageUrl;
  }

  // Método para generar array para mostrar las estrellas de rating
  getStarsArray(rating: number): number[] {
    return Array(5).fill(0).map((_, i) => i < Math.floor(rating) ? 1 : 0);
  }


  loadCategories(): void {
    this.categoryService.getCategories().subscribe({
      next: (data) => {
        this.categories = data;
        this.categoriesLoading = false;
      },
      error: (error) => {
        console.error('Error loading categories:', error);
        this.categoriesLoading = false;
      }
    });
  }

  loadFeaturedProducts(): void {
    this.productsLoading = true;

    this.productService.getProducts().subscribe({
      next: (products) => {
        this.allProducts = products;

        // Filtrar productos destacados (ejemplo: isBestSeller o isNew)
        this.featuredProducts = this.allProducts.filter(product =>
          product.isBestSeller || product.isNew
        );

        // Si quieres limitar a un número específico (ej. 6 productos)
        this.featuredProducts = this.featuredProducts.slice(0, 6);

        this.productsLoading = false;
      },
      error: (error) => {
        this.message.error('Error al cargar los productos destacados');
        console.error('Error:', error);
        this.productsLoading = false;
      }
    });
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
