import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';

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
  selector: 'app-instagram',
  imports: [
    CommonModule,
    FormsModule,
    NzGridModule,
    NzButtonModule,
    NzModalModule,
    NzIconModule
  ],
  templateUrl: './instagram.component.html',
  styleUrl: './instagram.component.css'
})
export class InstagramComponent implements OnInit {

  instagramFeed: InstagramPost[] = [];
  selectedPost: InstagramPost | null = null;
  newComment: string = '';

  
  @ViewChild('postDetailModal') postDetailModal!: TemplateRef<any>;
  @ViewChild('commentInput') commentInput!: ElementRef;
  

  constructor(
    private modalService: NzModalService
  ) { }

  ngOnInit(): void {
    this.loadInstagramFeed();
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
