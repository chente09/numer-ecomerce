import { Component, OnDestroy, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
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
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';

import { HeroService, HeroItem } from '../../../services/admin/hero/hero.service';
import { Subject, takeUntil, combineLatest, tap } from 'rxjs';
import { GenderSectionAdminComponent } from "../gender-section-admin/gender-section-admin.component";
import { NzDividerModule } from 'ng-zorro-antd/divider';

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
    NzPaginationModule,
    NzSpinModule,
    NzTagModule,
    GenderSectionAdminComponent,
    NzDividerModule
],
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeroesComponent implements OnInit, OnDestroy {
  heroes: HeroItem[] = [];
  activeHero: HeroItem | null = null;
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

  isMobileView = false;

  private destroy$ = new Subject<void>();

  constructor(
    private heroService: HeroService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef
  ) {
    this.detectViewportSize();
  }

  ngOnInit(): void {
    this.setupRealtimeUpdates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupObjectUrls();
  }

  // 🚀 CONFIGURAR ACTUALIZACIONES EN TIEMPO REAL
  private setupRealtimeUpdates(): void {
    this.loading = true;
    
    // Combinar stream de heroes y hero activo para sincronización completa
    combineLatest([
      this.heroService.getHeroes().pipe(
        tap(heroes => console.log('📊 Heroes recibidos en admin:', heroes.length))
      ),
      this.heroService.getActiveHero().pipe(
        tap(activeHero => console.log('🎯 Hero activo en admin:', activeHero?.title || 'ninguno'))
      ),
      this.heroService.getLoadingState()
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: ([heroes, activeHero, serviceLoading]) => {
        console.log('🔄 Actualizando estado del admin...');
        
        this.heroes = heroes || [];
        this.activeHero = activeHero;
        this.loading = serviceLoading;
        
        // Verificar sincronización
        if (this.heroes.length > 0 && activeHero) {
          const activeInList = this.heroes.find(h => h.id === activeHero.id && h.isActive);
          if (!activeInList) {
            console.warn('⚠️ Desincronización detectada: hero activo no está en la lista o no marcado como activo');
          }
        }
        
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('❌ Error en admin component:', err);
        this.message.error('Error al cargar los banners');
        this.loading = false;
        this.cdr.markForCheck();
      }
    });

    // También escuchar errores del servicio
    this.heroService.getErrorState().pipe(
      takeUntil(this.destroy$)
    ).subscribe(error => {
      if (error) {
        this.message.error(error);
      }
    });
  }

  // ✅ ACTIVAR HERO CON VERIFICACIÓN MEJORADA
  async setActive(id: string): Promise<void> {
    try {
      const hero = this.heroes.find(h => h.id === id);
      if (!hero) {
        this.message.error('Hero no encontrado');
        return;
      }

      // Verificar si ya está activo
      if (hero.isActive && this.activeHero?.id === id) {
        this.message.info(`El banner "${hero.title}" ya está activo`);
        return;
      }

      this.message.loading('Actualizando estado del banner...', { nzDuration: 0 });

      await this.heroService.setActiveHero(id);

      this.message.remove();
      this.message.success(`Banner "${hero.title}" establecido como activo`);

      // El service se actualiza automáticamente via listeners

    } catch (error: any) {
      this.message.remove();
      this.message.error(error.message || 'Error al cambiar estado del banner');
      console.error('💥 Error al activar hero:', error);
    }
  }

  // ✅ MODAL SIMPLIFICADO
  openModal(): void {
    this.modalVisible = true;
    this.form = {
      isActive: false,
      isGif: false,
      order: this.heroes.length + 1,
    };
    this.resetFileUploads();
    this.isEditMode = false;
    this.editingId = null;
  }

  closeModal(): void {
    this.cleanupObjectUrls();
    this.modalVisible = false;
  }

  // ✅ VALIDACIONES DE UPLOAD (MEJORADAS)
  beforeUploadMain = (file: NzUploadFile): boolean => {
    const actualFile = this.extractFileFromUpload(file);
    if (!actualFile) {
      this.mainImageError = 'Archivo inválido';
      return false;
    }

    const validation = this.validateImageFile(actualFile, 'desktop');
    
    if (!validation.valid) {
      this.mainImageError = validation.error || 'Error de validación';
      return false;
    }

    this.mainImageError = null;
    this.createImagePreview(actualFile, 'main');
    return false;
  };

  beforeUploadMobile = (file: NzUploadFile): boolean => {
    const actualFile = this.extractFileFromUpload(file);
    if (!actualFile) {
      this.mobileImageError = 'Archivo inválido';
      return false;
    }

    const validation = this.validateImageFile(actualFile, 'mobile');
    
    if (!validation.valid) {
      this.mobileImageError = validation.error || 'Error de validación';
      return false;
    }

    this.mobileImageError = null;
    this.createImagePreview(actualFile, 'mobile');
    return false;
  };

  // ✅ VALIDADOR DE ARCHIVOS MEJORADO
  private validateImageFile(file: File, type: 'desktop' | 'mobile'): { valid: boolean; error?: string } {
    // Validar tipo
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return { valid: false, error: 'Tipo de archivo no válido. Use JPG, PNG, WebP o GIF.' };
    }

    // Validar tamaño
    const maxSizeMB = type === 'desktop' ? 25 : 15;
    if (file.size > maxSizeMB * 1024 * 1024) {
      return { valid: false, error: `Archivo muy grande. Máximo ${maxSizeMB}MB.` };
    }

    const minSizeKB = type === 'desktop' ? 200 : 100;
    if (file.size < minSizeKB * 1024) {
      return { valid: false, error: `Archivo muy pequeño. Mínimo ${minSizeKB}KB para buena calidad.` };
    }

    // Auto-detectar GIF y establecer flag
    if (file.type === 'image/gif') {
      console.log('🎬 GIF detectado, estableciendo flag isGif = true');
      this.form.isGif = true;
      this.cdr.detectChanges();
    }

    return { valid: true };
  }

  // ✅ CREAR PREVIEW MEJORADO
  private createImagePreview(file: File, type: 'main' | 'mobile'): void {
    try {
      const objectUrl = URL.createObjectURL(file);
      const fileItem: NzUploadFile = {
        uid: `${Date.now()}-${file.name}`,
        name: file.name,
        status: 'done',
        url: objectUrl
      };

      if (type === 'main') {
        this.mainFileList = [fileItem];
        this.mainImageFile = file;
        console.log('🖼️ Preview imagen principal creado:', file.name, 'GIF:', file.type === 'image/gif');
      } else {
        this.mobileFileList = [fileItem];
        this.mobileImageFile = file;
        console.log('📱 Preview imagen móvil creado:', file.name, 'GIF:', file.type === 'image/gif');
      }

    } catch (e) {
      const errorMsg = 'No se pudo crear la vista previa';
      if (type === 'main') {
        this.mainImageError = errorMsg;
      } else {
        this.mobileImageError = errorMsg;
      }
      console.error('💥 Error creando preview:', e);
    }
  }

  // ✅ HANDLERS DE ARCHIVOS
  handlePreview = (file: NzUploadFile): void => {
    const fileUrl = file.url || file.thumbUrl;
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  handleRemoveMain = (): boolean => {
    this.cleanupFileList(this.mainFileList);
    this.mainFileList = [];
    this.mainImageFile = null;
    this.mainImageError = null;
    
    // Reset GIF flag si se remueve la imagen principal
    if (this.form.isGif && !this.mobileImageFile) {
      this.form.isGif = false;
    }
    
    return true;
  };

  handleRemoveMobile = (): boolean => {
    this.cleanupFileList(this.mobileFileList);
    this.mobileFileList = [];
    this.mobileImageFile = null;
    this.mobileImageError = null;
    return true;
  };

  // ✅ SUBMIT MEJORADO CON VERIFICACIÓN
  async handleSubmit(): Promise<void> {
    if (!this.validateForm()) return;

    this.saving = true;
    console.log('💾 Guardando hero con datos:', this.form);

    try {
      const cleanForm = this.cleanFormData(this.form);
      
      // Log para debug
      console.log('📋 Datos limpios a enviar:', {
        ...cleanForm,
        isGif: cleanForm.isGif,
        mainImageType: this.mainImageFile?.type,
        mobileImageType: this.mobileImageFile?.type
      });

      if (this.isEditMode && this.editingId) {
        await this.heroService.updateHero(
          this.editingId,
          cleanForm,
          this.mainImageFile || undefined,
          this.mobileImageFile || undefined
        );
        this.message.success('Banner actualizado con éxito');
      } else {
        const heroId = await this.heroService.createHero(
          cleanForm as any,
          this.mainImageFile!,
          this.mobileImageFile || undefined
        );
        console.log('✅ Hero creado con ID:', heroId);
        this.message.success('Banner creado con éxito');
      }

      this.modalVisible = false;
      // No necesitamos fetchHeroes ya que el service se actualiza automáticamente

    } catch (error: any) {
      console.error('💥 Error al guardar:', error);
      this.message.error(error.message || 'Error al guardar el banner');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  // ✅ LIMPIAR DATOS DEL FORMULARIO MEJORADO
  private cleanFormData(form: Partial<HeroItem>): Partial<HeroItem> {
    const cleaned: Partial<HeroItem> = {};
    
    Object.keys(form).forEach(key => {
      const value = (form as any)[key];
      
      // Solo incluir valores que no sean undefined, null o string vacío
      if (value !== undefined && value !== null && value !== '') {
        cleaned[key as keyof HeroItem] = value;
      }
    });
    
    // Asegurar que isGif esté correctamente establecido
    if (this.mainImageFile?.type === 'image/gif' || this.mobileImageFile?.type === 'image/gif') {
      cleaned.isGif = true;
    }
    
    console.log('🧹 Datos después de limpiar:', cleaned);
    return cleaned;
  }

  // ✅ VALIDAR FORMULARIO MEJORADO
  private validateForm(): boolean {
    if (!this.form.title?.trim() || !this.form.subtitle?.trim() || 
        !this.form.ctaText?.trim() || !this.form.ctaLink?.trim()) {
      this.message.warning('Todos los campos principales son obligatorios');
      return false;
    }

    if (!this.mainImageFile && !this.isEditMode) {
      this.message.warning('Debe seleccionar una imagen principal');
      return false;
    }

    if (this.form.ctaLink && !this.isValidUrl(this.form.ctaLink)) {
      this.message.warning('El enlace del botón debe ser una URL válida (empezar con http:// o /)');
      return false;
    }

    return true;
  }

  // ✅ EDITAR HERO MEJORADO
  editHero(hero: HeroItem): void {
    console.log('✏️ Editando hero:', hero.title, 'GIF:', hero.isGif);
    
    this.form = {
      title: hero.title || '',
      subtitle: hero.subtitle || '',
      ctaText: hero.ctaText || '',
      ctaLink: hero.ctaLink || '',
      isGif: hero.isGif === true, // Asegurar boolean
      isActive: hero.isActive === true, // Asegurar boolean
      order: hero.order || 1,
      backgroundColor: hero.backgroundColor || undefined,
      textColor: hero.textColor || undefined,
      startDate: hero.startDate ? new Date(hero.startDate) : undefined,
      endDate: hero.endDate ? new Date(hero.endDate) : undefined
    };
    
    this.editingId = hero.id;
    this.isEditMode = true;
    this.modalVisible = true;
    this.resetFileUploads();
    this.setupCurrentImages(hero);
    
    console.log('📝 Formulario de edición configurado:', this.form);
  }

  // ✅ CONFIGURAR IMÁGENES ACTUALES
  private setupCurrentImages(hero: HeroItem): void {
    if (hero.imageUrl) {
      this.mainFileList = [{
        uid: `main-${hero.id}`,
        name: `imagen-actual-${hero.isGif ? 'gif' : 'jpg'}`,
        status: 'done',
        url: hero.imageUrl
      }];
    }

    if (hero.mobileImageUrl) {
      this.mobileFileList = [{
        uid: `mobile-${hero.id}`,
        name: `imagen-movil-actual-${hero.isGif ? 'gif' : 'jpg'}`,
        status: 'done',
        url: hero.mobileImageUrl
      }];
    }
  }

  // ✅ ELIMINAR HERO MEJORADO
  async deleteHero(id: string): Promise<void> {
    try {
      const hero = this.heroes.find(h => h.id === id);
      if (!hero) {
        this.message.error('Hero no encontrado');
        return;
      }

      // Verificar si es el hero activo
      if (hero.isActive) {
        this.message.warning('No se puede eliminar el banner activo. Active otro banner primero.');
        return;
      }

      this.message.loading('Eliminando banner...', { nzDuration: 0 });
      await this.heroService.deleteHero(id);
      this.message.remove();
      this.message.success(`Banner "${hero.title}" eliminado correctamente`);
      
      // El service se actualiza automáticamente

    } catch (error: any) {
      this.message.remove();
      console.error('💥 Error al eliminar:', error);
      this.message.error(error.message || 'Error al eliminar el banner');
    }
  }

  // ✅ ORDENAMIENTO (sin cambios)
  async moveUp(hero: HeroItem): Promise<void> {
    const index = this.heroes.findIndex(h => h.id === hero.id);
    if (index <= 0) return;

    const newOrder = this.heroes.map(h => h.id);
    [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];

    try {
      await this.heroService.updateHeroesOrder(newOrder);
      this.message.success('Orden actualizado');
    } catch (error: any) {
      this.message.error('Error al actualizar el orden');
    }
  }

  async moveDown(hero: HeroItem): Promise<void> {
    const index = this.heroes.findIndex(h => h.id === hero.id);
    if (index >= this.heroes.length - 1) return;

    const newOrder = this.heroes.map(h => h.id);
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];

    try {
      await this.heroService.updateHeroesOrder(newOrder);
      this.message.success('Orden actualizado');
    } catch (error: any) {
      this.message.error('Error al actualizar el orden');
    }
  }

  // ✅ MÉTODOS HELPER (sin cambios mayores)
  private extractFileFromUpload(nzFile: NzUploadFile): File | null {
    if (nzFile.originFileObj) {
      return nzFile.originFileObj as File;
    }
    
    if ((nzFile as any).file) {
      return (nzFile as any).file as File;
    }
    
    if (nzFile instanceof File) {
      return nzFile;
    }
    
    return null;
  }

  private detectViewportSize(): void {
    this.isMobileView = window.innerWidth <= 480;
  }

  private isValidUrl(url: string): boolean {
    if (url.startsWith('/')) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private resetFileUploads(): void {
    this.cleanupObjectUrls();
    this.mainFileList = [];
    this.mobileFileList = [];
    this.mainImageFile = null;
    this.mobileImageFile = null;
    this.mainImageError = null;
    this.mobileImageError = null;
  }

  private cleanupObjectUrls(): void {
    [...this.mainFileList, ...this.mobileFileList].forEach(file => {
      if (file.url && file.url.startsWith('blob:')) {
        URL.revokeObjectURL(file.url);
      }
    });
  }

  private cleanupFileList(fileList: NzUploadFile[]): void {
    fileList.forEach(file => {
      if (file.url && file.url.startsWith('blob:')) {
        URL.revokeObjectURL(file.url);
      }
    });
  }

  // ✅ UTILIDADES DE TEMPLATE MEJORADAS
  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    imgElement.src = 'assets/placeholder.png';
    imgElement.onerror = null;
  }

  formatDate(date?: Date): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('es-ES');
  }

  trackById(index: number, item: HeroItem): string {
    return `${item.id}-${item.order}-${item.isActive}-${item.isGif}`;
  }

  getHeroStatusTag(hero: HeroItem): { color: string; text: string } {
    if (hero.isActive) {
      return { color: 'green', text: 'Activo' };
    }

    const now = new Date();
    
    if (hero.startDate && hero.startDate > now) {
      return { color: 'blue', text: 'Programado' };
    }

    if (hero.endDate && hero.endDate < now) {
      return { color: 'red', text: 'Expirado' };
    }

    return { color: 'default', text: 'Inactivo' };
  }

  // ✅ MÉTODO PARA DEBUGGING
  getHeroDebugInfo(hero: HeroItem): string {
    return `ID: ${hero.id}, GIF: ${hero.isGif}, Activo: ${hero.isActive}, Orden: ${hero.order}`;
  }

  // ✅ VERIFICAR SINCRONIZACIÓN
  isHeroSynced(hero: HeroItem): boolean {
    if (hero.isActive) {
      return this.activeHero?.id === hero.id;
    }
    return true;
  }

  // ✅ FORZAR RESINCRONIZACIÓN
  async forceResync(): Promise<void> {
    try {
      this.message.loading('Resincronizando datos...', { nzDuration: 0 });
      
      // Forzar refresh completo
      this.heroService.getHeroes(true).pipe(
        takeUntil(this.destroy$)
      ).subscribe(() => {
        this.message.remove();
        this.message.success('Datos resincronizados correctamente');
      });
      
    } catch (error) {
      this.message.remove();
      this.message.error('Error al resincronizar');
    }
  }
}