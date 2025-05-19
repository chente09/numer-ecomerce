import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzUploadModule, NzUploadFile } from 'ng-zorro-antd/upload';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzColorPickerModule } from 'ng-zorro-antd/color-picker';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';

import { HeroService, HeroItem } from '../../../services/admin/hero/hero.service';
import { Subscription } from 'rxjs';
import { ReviewManagementComponent } from "../review-management/review-management.component";

@Component({
  selector: 'app-heroes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzButtonModule,
    NzModalModule,
    NzTableModule,
    NzFormModule,
    NzInputModule,
    NzCardModule,
    NzUploadModule,
    NzIconModule,
    NzPopconfirmModule,
    NzSwitchModule,
    NzDatePickerModule,
    NzToolTipModule,
    NzBadgeModule,
    NzColorPickerModule,
    NzInputNumberModule,
    ReviewManagementComponent
],
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css']
})
export class HeroesComponent implements OnInit, OnDestroy {
  heroes: HeroItem[] = [];
  loading = false;
  saving = false;
  modalVisible = false;
  isEditMode = false;
  form: Partial<HeroItem> = {};
  editingId: string | null = null;

  // Para subida de imágenes
  mainImageFile: File | null = null;
  mobileImageFile: File | null = null;
  mainFileList: NzUploadFile[] = [];
  mobileFileList: NzUploadFile[] = [];
  mainImageError: string | null = null;
  mobileImageError: string | null = null;

  private subscription = new Subscription();

  constructor(
    private heroService: HeroService,
    private message: NzMessageService
  ) { }

  ngOnInit(): void {
    this.fetchHeroes();
  }

  fetchHeroes(): void {
    this.loading = true;
    // Cancelar cualquier suscripción anterior
    this.subscription.unsubscribe();
    this.subscription = new Subscription();

    // Añadir la nueva suscripción al grupo
    this.subscription.add(
      this.heroService.getHeroes(true).subscribe({
        next: (data) => {
          this.heroes = data;
          this.loading = false;
        },
        error: (err) => {
          this.message.error('Error al cargar los banners');
          this.loading = false;
        }
      })
    );
  }

  ngOnDestroy(): void {
    // Importante: cancelar todas las suscripciones al destruir el componente
    this.subscription.unsubscribe();
  }

  openModal(): void {
    this.modalVisible = true;
    this.form = {
      isActive: false,
      isGif: false,
      order: this.heroes.length + 1
    };
    this.mainFileList = [];
    this.mobileFileList = [];
    this.isEditMode = false;
    this.editingId = null;
    this.mainImageFile = null;
    this.mobileImageFile = null;
  }

  closeModal(): void {
    this.modalVisible = false;
  }

  // Validador para la imagen principal
  beforeUploadMain = (file: NzUploadFile): boolean => {
    this.mainImageError = null;

    const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name || '');
    if (!isImage) {
      this.mainImageError = 'Solo puedes subir archivos de imagen (.jpg, .png, .gif, .webp)';
      return false;
    }

    const actualFile = (file.originFileObj as File) || (file as any);

    if (!actualFile || typeof actualFile.size !== 'number') {
      this.mainImageError = 'El archivo es inválido o está corrupto';
      return false;
    }

    const isLt5M = actualFile.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      this.mainImageError = 'La imagen debe pesar menos de 5MB';
      return false;
    }

    // Actualizar formulario para GIF automáticamente si el archivo es un GIF
    if (file.type === 'image/gif' || file.name?.toLowerCase().endsWith('.gif')) {
      this.form.isGif = true;
    }

    // Crear vista previa
    try {
      const objectUrl = URL.createObjectURL(actualFile);
      this.mainFileList = [
        {
          uid: `${Date.now()}-${file.name}`,
          name: file.name || 'imagen.jpg',
          status: 'done',
          url: objectUrl
        }
      ];
      this.mainImageFile = actualFile;
    } catch (e) {
      this.mainImageError = 'No se pudo cargar la vista previa';
      return false;
    }

    return false; // Siempre retorna false para manejar la subida manualmente
  };

  // Validador para la imagen móvil
  beforeUploadMobile = (file: NzUploadFile): boolean => {
    this.mobileImageError = null;

    const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name || '');
    if (!isImage) {
      this.mobileImageError = 'Solo puedes subir archivos de imagen (.jpg, .png, .gif, .webp)';
      return false;
    }

    const actualFile = (file.originFileObj as File) || (file as any);

    if (!actualFile || typeof actualFile.size !== 'number') {
      this.mobileImageError = 'El archivo es inválido o está corrupto';
      return false;
    }

    const isLt3M = actualFile.size / 1024 / 1024 < 3;
    if (!isLt3M) {
      this.mobileImageError = 'La imagen debe pesar menos de 3MB';
      return false;
    }

    // Crear vista previa
    try {
      const objectUrl = URL.createObjectURL(actualFile);
      this.mobileFileList = [
        {
          uid: `${Date.now()}-${file.name}`,
          name: file.name || 'imagen_mobile.jpg',
          status: 'done',
          url: objectUrl
        }
      ];
      this.mobileImageFile = actualFile;
    } catch (e) {
      this.mobileImageError = 'No se pudo cargar la vista previa';
      return false;
    }

    return false; // Siempre retorna false para manejar la subida manualmente
  };

  handlePreview = (file: NzUploadFile): void => {
    const fileUrl = file.url || file.thumbUrl;
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  handleRemoveMain = (): boolean => {
    this.mainFileList = [];
    this.mainImageFile = null;
    return true;
  };

  handleRemoveMobile = (): boolean => {
    this.mobileFileList = [];
    this.mobileImageFile = null;
    return true;
  };

  async handleSubmit(): Promise<void> {
    if (!this.form.title || !this.form.subtitle || !this.form.ctaText || !this.form.ctaLink) {
      this.message.warning('Los campos de título, subtítulo, texto y enlace del botón son obligatorios.');
      return;
    }

    if (!this.mainImageFile && !this.isEditMode) {
      this.message.warning('Debe seleccionar una imagen principal.');
      return;
    }

    this.saving = true;
    try {
      if (this.isEditMode && this.editingId) {
        // Actualizar banner existente
        await this.heroService.updateHero(
          this.editingId,
          this.form,
          this.mainImageFile || undefined,
          this.mobileImageFile || undefined
        );
        this.message.success('Banner actualizado con éxito');
      } else {
        // Crear nuevo banner
        await this.heroService.createHero(
          this.form as any,
          this.mainImageFile!,
          this.mobileImageFile || undefined
        );
        this.message.success('Banner creado con éxito');
      }
      this.modalVisible = false;
      this.fetchHeroes();
    } catch (error: any) {
      this.message.error(error.message || 'Error al guardar el banner');
    } finally {
      this.saving = false;
    }
  }

  editHero(hero: HeroItem): void {
    this.form = {
      ...hero,
      // Convertir fechas a objetos Date si vienen como timestamps
      startDate: hero.startDate ? new Date(hero.startDate) : undefined,
      endDate: hero.endDate ? new Date(hero.endDate) : undefined
    };
    this.editingId = hero.id ?? null;
    this.isEditMode = true;
    this.modalVisible = true;

    // Mostrar la imagen principal actual en el fileList
    if (hero.imageUrl) {
      this.mainFileList = [
        {
          uid: '-1',
          name: 'imagen actual',
          status: 'done',
          url: hero.imageUrl
        }
      ];
    } else {
      this.mainFileList = [];
    }

    // Mostrar la imagen móvil actual en el fileList si existe
    if (hero.mobileImageUrl) {
      this.mobileFileList = [
        {
          uid: '-1',
          name: 'imagen móvil actual',
          status: 'done',
          url: hero.mobileImageUrl
        }
      ];
    } else {
      this.mobileFileList = [];
    }
  }

  async deleteHero(id: string): Promise<void> {
    try {
      await this.heroService.deleteHero(id);
      this.message.success('Banner eliminado con éxito');
      this.fetchHeroes();
    } catch (error: any) {
      this.message.error(error.message || 'Error al eliminar el banner');
    }
  }

  async setActive(id: string): Promise<void> {
    try {
      await this.heroService.setActiveHero(id);
      this.message.success('Banner establecido como activo');
      this.fetchHeroes();
    } catch (error: any) {
      this.message.error(error.message || 'Error al establecer el banner como activo');
    }
  }

  // Método auxiliar para mover un héroe hacia arriba (menor orden)
  async moveUp(hero: HeroItem): Promise<void> {
    const index = this.heroes.findIndex(h => h.id === hero.id);
    if (index <= 0) return; // Ya está en la primera posición

    const newOrder = [...this.heroes.map(h => h.id!)];
    // Intercambiar posiciones
    [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];

    try {
      await this.heroService.updateHeroesOrder(newOrder);
      this.message.success('Orden actualizado con éxito');
      this.fetchHeroes();
    } catch (error: any) {
      this.message.error(error.message || 'Error al actualizar el orden');
    }
  }

  // Método auxiliar para mover un héroe hacia abajo (mayor orden)
  async moveDown(hero: HeroItem): Promise<void> {
    const index = this.heroes.findIndex(h => h.id === hero.id);
    if (index >= this.heroes.length - 1) return; // Ya está en la última posición

    const newOrder = [...this.heroes.map(h => h.id!)];
    // Intercambiar posiciones
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];

    try {
      await this.heroService.updateHeroesOrder(newOrder);
      this.message.success('Orden actualizado con éxito');
      this.fetchHeroes();
    } catch (error: any) {
      this.message.error(error.message || 'Error al actualizar el orden');
    }
  }

  // Formatear fecha para mostrar en tabla
  formatDate(date?: Date): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  }
}
