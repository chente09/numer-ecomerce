import { Component, OnDestroy, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzBadgeModule } from 'ng-zorro-antd/badge';

import { GenderSectionService, GenderSectionItem, GenderSectionConfig } from '../../../services/admin/genderSection/gender-section.service';
import { Subject, takeUntil } from 'rxjs';

// Configuraciones más permisivas
const IMAGE_LIMITS = {
  DESKTOP_MAX_MB: 25, // Aumentado de 15 a 25MB
  MOBILE_MAX_MB: 15,  // Aumentado de 10 a 15MB
  ALLOWED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  MIN_SIZE_KB: 1      // Reducido a 1KB mínimo
};

@Component({
  selector: 'app-gender-section-admin',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
    NzToolTipModule,
    NzInputNumberModule,
    NzSpinModule,
    NzTagModule,
    NzSelectModule,
    NzDividerModule,
    NzBadgeModule
  ],
  templateUrl: './gender-section-admin.component.html',
  styleUrl: './gender-section-admin.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenderSectionAdminComponent implements OnInit, OnDestroy {

  // Estados básicos
  items: GenderSectionItem[] = [];
  config: GenderSectionConfig | null = null;
  loading = false;
  saving = false;

  // Modales
  itemModalVisible = false;
  configModalVisible = false;
  isEditMode = false;
  editingId: string | null = null;

  // Formularios
  itemForm!: FormGroup;
  configForm!: FormGroup;

  // Archivos de imagen
  desktopFileList: NzUploadFile[] = [];
  mobileFileList: NzUploadFile[] = [];
  desktopImageFile: File | null = null;
  mobileImageFile: File | null = null;
  desktopImageError: string | null = null;
  mobileImageError: string | null = null;

  // Opciones
  categoryOptions = [
    { label: 'Hombre', value: 'man' },
    { label: 'Mujer', value: 'woman' },
    { label: 'Unisex', value: 'unisex' }
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private genderService: GenderSectionService,
    private message: NzMessageService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder
  ) {
    this.initializeForms();
  }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupFiles();
  }

  // ===== INICIALIZACIÓN =====

  private initializeForms(): void {
    // Formulario de item
    this.itemForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(2)]],
      category: ['unisex', [Validators.required]],
      subtitle: ['Explorar colección'],
      alt: [''],
      isActive: [true],
      order: [1, [Validators.required, Validators.min(1)]],
      backgroundColor: [''],
      textColor: ['#ffffff']
    });

    // Formulario de configuración
    this.configForm = this.fb.group({
      sectionTitle: ['Para Cada Aventurero', [Validators.required]],
      titleColor: ['aliceblue'],
      backgroundColor: ['#000000'],
      isActive: [true]
    });
  }

  private loadData(): void {
    // No mostrar loading inicial si ya hay datos en cache
    const hasData = this.items.length > 0 || this.config !== null;
    if (!hasData) {
      this.loading = true;
      this.cdr.markForCheck();
    }

    // Cargar items
    this.genderService.getItems().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (items) => {
        this.items = items || [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error cargando items:', error);
        this.message.error('Error al cargar los items');
        this.loading = false;
        this.cdr.markForCheck();
      }
    });

    // Cargar configuración
    this.genderService.getConfig().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (config) => {
        this.config = config;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error cargando config:', error);
        this.message.error('Error al cargar la configuración');
      }
    });
  }

  // ===== GESTIÓN DE ITEMS =====

  openItemModal(): void {
    const nextOrder = this.items.length > 0 ? Math.max(...this.items.map(i => i.order || 0)) + 1 : 1;

    this.itemForm.reset({
      title: '',
      category: 'unisex',
      subtitle: 'Explorar colección',
      alt: '',
      isActive: true,
      order: nextOrder,
      backgroundColor: '',
      textColor: '#ffffff'
    });

    this.isEditMode = false;
    this.editingId = null;
    this.itemModalVisible = true;
    this.resetFiles();
  }

  editItem(item: GenderSectionItem): void {
    if (!item?.id) return;

    this.itemForm.patchValue({
      title: item.title || '',
      category: item.category || 'unisex',
      subtitle: item.subtitle || 'Explorar colección',
      alt: item.alt || '',
      isActive: item.isActive ?? true,
      order: item.order || 1,
      backgroundColor: item.backgroundColor || '',
      textColor: item.textColor || '#ffffff'
    });

    this.isEditMode = true;
    this.editingId = item.id;
    this.itemModalVisible = true;
    this.resetFiles();
    this.setupExistingImages(item);
  }

  private setupExistingImages(item: GenderSectionItem): void {
    if (item.imageUrl) {
      this.desktopFileList = [{
        uid: `desktop-${item.id}`,
        name: `imagen-desktop.jpg`,
        status: 'done',
        url: item.imageUrl
      }];
    }

    if (item.mobileImageUrl) {
      this.mobileFileList = [{
        uid: `mobile-${item.id}`,
        name: `imagen-mobile.jpg`,
        status: 'done',
        url: item.mobileImageUrl
      }];
    }
  }

  closeItemModal(): void {
    this.itemModalVisible = false;
    this.resetFiles();
    this.itemForm.reset();
  }

  async handleItemSubmit(): Promise<void> {
    if (!this.itemForm.valid) {
      this.markFormGroupTouched(this.itemForm);
      this.message.warning('Complete todos los campos obligatorios');
      return;
    }

    if (!this.desktopImageFile && !this.isEditMode) {
      this.message.warning('Debe seleccionar una imagen principal');
      return;
    }

    // Mostrar loading inmediatamente pero no bloquear UI
    this.saving = true;
    this.cdr.markForCheck();

    // Mostrar mensaje de progreso
    const progressMsg = this.message.loading(
      this.isEditMode ? 'Actualizando item...' : 'Creando item...',
      { nzDuration: 0 }
    );

    try {
      const formData = this.cleanFormData(this.itemForm.value);

      if (this.isEditMode && this.editingId) {
        await this.genderService.updateItem(
          this.editingId,
          formData,
          this.desktopImageFile || undefined,
          this.mobileImageFile || undefined
        );
        this.message.remove(progressMsg.messageId);
        this.message.success('Item actualizado correctamente');
      } else {
        await this.genderService.createItem(
          formData,
          this.desktopImageFile!,
          this.mobileImageFile || undefined
        );
        this.message.remove(progressMsg.messageId);
        this.message.success('Item creado correctamente');
      }

      // Cerrar modal inmediatamente después del éxito
      this.closeItemModal();

    } catch (error: any) {
      this.message.remove(progressMsg.messageId);
      console.error('Error guardando item:', error);
      this.message.error(error.message || 'Error al guardar el item');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  async deleteItem(id: string): Promise<void> {
    if (!id) return;

    try {
      await this.genderService.deleteItem(id);
      this.message.success('Item eliminado correctamente');
    } catch (error: any) {
      console.error('Error eliminando item:', error);
      this.message.error('Error al eliminar el item');
    }
  }

  // ===== CONFIGURACIÓN =====

  openConfigModal(): void {
    this.configForm.patchValue({
      sectionTitle: this.config?.sectionTitle || 'Para Cada Aventurero',
      titleColor: this.config?.titleColor || 'aliceblue',
      backgroundColor: this.config?.backgroundColor || '#000000',
      isActive: this.config?.isActive ?? true
    });

    this.configModalVisible = true;
  }

  closeConfigModal(): void {
    this.configModalVisible = false;
  }

  async saveConfig(): Promise<void> {
    if (!this.configForm.valid) {
      this.markFormGroupTouched(this.configForm);
      this.message.warning('Complete todos los campos obligatorios');
      return;
    }

    // Mostrar loading y mensaje de progreso
    this.saving = true;
    this.cdr.markForCheck();

    const progressMsg = this.message.loading('Guardando configuración...', { nzDuration: 0 });

    try {
      await this.genderService.updateConfig(this.configForm.value);
      this.message.remove(progressMsg.messageId);
      this.message.success('Configuración actualizada correctamente');
      this.configModalVisible = false;
    } catch (error: any) {
      this.message.remove(progressMsg.messageId);
      console.error('Error guardando configuración:', error);
      this.message.error('Error al guardar la configuración');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  // ===== ORDEN =====

  async moveUp(item: GenderSectionItem): Promise<void> {
    const index = this.items.findIndex(i => i.id === item.id);
    if (index <= 0) return;

    const newOrder = this.items.map(i => i.id);
    [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];

    try {
      await this.genderService.updateItemsOrder(newOrder);
      this.message.success('Orden actualizado');
    } catch (error) {
      this.message.error('Error al actualizar el orden');
    }
  }

  async moveDown(item: GenderSectionItem): Promise<void> {
    const index = this.items.findIndex(i => i.id === item.id);
    if (index >= this.items.length - 1) return;

    const newOrder = this.items.map(i => i.id);
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];

    try {
      await this.genderService.updateItemsOrder(newOrder);
      this.message.success('Orden actualizado');
    } catch (error) {
      this.message.error('Error al actualizar el orden');
    }
  }

  // ===== MANEJO DE IMÁGENES OPTIMIZADO =====

  beforeUploadDesktop = (file: NzUploadFile): boolean => {
    return this.handleFileUpload(file, 'desktop');
  };

  beforeUploadMobile = (file: NzUploadFile): boolean => {
    return this.handleFileUpload(file, 'mobile');
  };

  private handleFileUpload(file: NzUploadFile, type: 'desktop' | 'mobile'): boolean {
    console.log('📁 Procesando archivo:', file);

    const actualFile = this.extractFile(file);
    if (!actualFile) {
      this.setImageError(type, 'No se pudo extraer el archivo');
      return false;
    }

    console.log('📊 Archivo extraído:', {
      name: actualFile.name,
      type: actualFile.type,
      size: actualFile.size,
      sizeKB: (actualFile.size / 1024).toFixed(1),
      sizeMB: (actualFile.size / 1024 / 1024).toFixed(2)
    });

    // Validación permisiva con logging detallado
    const validation = this.validateFilePermissive(actualFile, type);
    if (!validation.valid) {
      console.error('❌ Validación fallida:', validation.error);
      this.setImageError(type, validation.error!);
      return false;
    }

    this.clearImageError(type);

    // Crear preview inmediatamente
    this.createPreviewFast(actualFile, type);

    return false; // Evitar upload automático
  }

  // Validación más permisiva
  private validateFilePermissive(file: File, type: 'desktop' | 'mobile'): { valid: boolean; error?: string } {
    // Lista extendida de tipos MIME permitidos
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif' // Agregamos GIF también
    ];

    // También verificar por extensión si el MIME type falla
    const fileName = file.name.toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
      return {
        valid: false,
        error: `Formato no soportado: ${file.type || 'desconocido'}. Use JPG, PNG, WebP o GIF.`
      };
    }

    // Tamaño máximo más generoso
    const maxMB = type === 'desktop' ? 25 : 15; // Aumentamos los límites
    const maxBytes = maxMB * 1024 * 1024;

    if (file.size > maxBytes) {
      return {
        valid: false,
        error: `Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(2)}MB. Máximo ${maxMB}MB.`
      };
    }

    // Tamaño mínimo muy bajo
    const minBytes = 1024; // Solo 1KB mínimo
    if (file.size < minBytes) {
      return {
        valid: false,
        error: `Archivo muy pequeño: ${file.size} bytes. Mínimo 1KB.`
      };
    }

    console.log('✅ Archivo válido:', {
      type: file.type,
      size: `${(file.size / 1024).toFixed(1)}KB`,
      maxAllowed: `${maxMB}MB`
    });

    return { valid: true };
  }

  private extractFile(nzFile: NzUploadFile): File | null {
    console.log('🔍 Intentando extraer archivo:', nzFile);

    // Método 1: originFileObj (más común)
    if (nzFile.originFileObj instanceof File) {
      console.log('✅ Archivo extraído via originFileObj');
      return nzFile.originFileObj;
    }

    // Método 2: propiedad file
    if ((nzFile as any).file instanceof File) {
      console.log('✅ Archivo extraído via file property');
      return (nzFile as any).file;
    }

    // Método 3: el objeto es directamente un File
    if (nzFile instanceof File) {
      console.log('✅ Archivo es directamente un File');
      return nzFile;
    }

    // Método 4: buscar en otras propiedades posibles
    const possibleProps = ['fileObj', 'rawFile', 'raw', 'fileData'];
    for (const prop of possibleProps) {
      const fileCandidate = (nzFile as any)[prop];
      if (fileCandidate instanceof File) {
        console.log(`✅ Archivo extraído via ${prop}`);
        return fileCandidate;
      }
    }

    // Método 5: si tiene URL pero no File, intentar crear desde blob
    if (nzFile.url && nzFile.url.startsWith('blob:')) {
      console.log('⚠️ Solo encontrado blob URL, no File object');
      // En este caso no podemos extraer el File original
      return null;
    }

    console.error('❌ No se pudo extraer archivo de:', {
      type: typeof nzFile,
      props: Object.keys(nzFile),
      hasOriginFileObj: !!nzFile.originFileObj,
      originFileObjType: typeof nzFile.originFileObj
    });

    return null;
  }

  private validateFile(file: File, type: 'desktop' | 'mobile'): { valid: boolean; error?: string } {
    // Validar tipo de archivo
    console.log('🔍 Validando archivo:', {
      name: file.name,
      type: file.type,
      size: file.size,
      sizeKB: (file.size / 1024).toFixed(1)
    });

    if (!IMAGE_LIMITS.ALLOWED_TYPES.includes(file.type)) {
      const error = `Tipo de archivo no válido: ${file.type}. Use JPG, PNG o WebP.`;
      console.error('❌ Tipo inválido:', error);
      return { valid: false, error };
    }

    // Validar tamaño máximo
    const maxMB = type === 'desktop' ? IMAGE_LIMITS.DESKTOP_MAX_MB : IMAGE_LIMITS.MOBILE_MAX_MB;
    const maxBytes = maxMB * 1024 * 1024;

    if (file.size > maxBytes) {
      const error = `Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(2)}MB. Máximo ${maxMB}MB.`;
      console.error('❌ Muy grande:', error);
      return { valid: false, error };
    }

    // Validar tamaño mínimo (reducido a 10KB)
    const minBytes = 10 * 1024; // 10KB en lugar de 50KB
    if (file.size < minBytes) {
      const error = `Archivo muy pequeño: ${(file.size / 1024).toFixed(1)}KB. Mínimo 10KB.`;
      console.error('❌ Muy pequeño:', error);
      return { valid: false, error };
    }

    // Validaciones adicionales para imágenes
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        console.log('📐 Dimensiones de imagen:', {
          width: img.width,
          height: img.height,
          aspectRatio: (img.width / img.height).toFixed(2)
        });

        // Validar dimensiones mínimas
        if (img.width < 100 || img.height < 100) {
          resolve({
            valid: false,
            error: `Dimensiones muy pequeñas: ${img.width}x${img.height}px. Mínimo 100x100px.`
          });
          return;
        }

        // Validar dimensiones máximas
        if (img.width > 4000 || img.height > 4000) {
          resolve({
            valid: false,
            error: `Dimensiones muy grandes: ${img.width}x${img.height}px. Máximo 4000x4000px.`
          });
          return;
        }

        // Validation successful
        console.log('✅ Archivo válido');
        resolve({ valid: true });
      };

      img.onerror = () => {
        console.error('❌ Error cargando imagen');
        resolve({
          valid: false,
          error: 'Archivo de imagen corrupto o no válido.'
        });
      };

      img.src = URL.createObjectURL(file);
    }) as any; // Cast para mantener compatibilidad con el tipo existente

    // Para compatibilidad inmediata, retornar válido por defecto
    console.log('✅ Validación básica pasada');
    return { valid: true };
  }

  // Preview más rápido usando URL.createObjectURL directamente
  private createPreviewFast(file: File, type: 'desktop' | 'mobile'): void {
    try {
      const url = URL.createObjectURL(file);
      const fileItem: NzUploadFile = {
        uid: `${type}-${Date.now()}`,
        name: file.name,
        status: 'done',
        url: url
      };

      if (type === 'desktop') {
        this.cleanupFileList(this.desktopFileList);
        this.desktopFileList = [fileItem];
        this.desktopImageFile = file;
      } else {
        this.cleanupFileList(this.mobileFileList);
        this.mobileFileList = [fileItem];
        this.mobileImageFile = file;
      }

      // Mostrar información del archivo
      const sizeKB = (file.size / 1024).toFixed(1);
      this.message.success(`Imagen ${type} seleccionada (${sizeKB}KB)`);

      this.cdr.markForCheck();
    } catch (error) {
      this.setImageError(type, 'Error creando vista previa');
    }
  }

  handlePreview = (file: NzUploadFile): void => {
    if (file.url) {
      window.open(file.url, '_blank');
    }
  };

  handleRemoveDesktop = (file: NzUploadFile): boolean => {
    this.cleanupFileList(this.desktopFileList);
    this.desktopFileList = [];
    this.desktopImageFile = null;
    this.desktopImageError = null;
    this.cdr.markForCheck();
    return true;
  };

  handleRemoveMobile = (file: NzUploadFile): boolean => {
    this.cleanupFileList(this.mobileFileList);
    this.mobileFileList = [];
    this.mobileImageFile = null;
    this.mobileImageError = null;
    this.cdr.markForCheck();
    return true;
  };

  // ===== MANEJO DE COLORES =====

  updateBackgroundColor(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.itemForm.patchValue({ backgroundColor: value });
  }

  updateTextColor(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.itemForm.patchValue({ textColor: value });
  }

  updateTitleColor(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.configForm.patchValue({ titleColor: value });
  }

  updateConfigBackgroundColor(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.configForm.patchValue({ backgroundColor: value });
  }

  // ===== UTILIDADES =====

  private cleanFormData(form: any): Partial<GenderSectionItem> {
    const cleaned: any = {};

    Object.entries(form).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (typeof value === 'string') {
          cleaned[key] = value.trim();
        } else {
          cleaned[key] = value;
        }
      }
    });

    // Auto-generar ALT si no existe
    if (cleaned.title && !cleaned.alt) {
      const categoryLabel = this.getCategoryLabel(cleaned.category);
      cleaned.alt = `Colección ${cleaned.title} - Productos para ${categoryLabel}`;
    }

    return cleaned;
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      if (control) {
        control.markAsTouched();
        control.markAsDirty();
      }
    });
  }

  private setImageError(type: 'desktop' | 'mobile', error: string): void {
    if (type === 'desktop') {
      this.desktopImageError = error;
    } else {
      this.mobileImageError = error;
    }
    this.cdr.markForCheck();
  }

  private clearImageError(type: 'desktop' | 'mobile'): void {
    if (type === 'desktop') {
      this.desktopImageError = null;
    } else {
      this.mobileImageError = null;
    }
  }

  private resetFiles(): void {
    this.cleanupFiles();
    this.desktopFileList = [];
    this.mobileFileList = [];
    this.desktopImageFile = null;
    this.mobileImageFile = null;
    this.desktopImageError = null;
    this.mobileImageError = null;
  }

  private cleanupFiles(): void {
    this.cleanupFileList(this.desktopFileList);
    this.cleanupFileList(this.mobileFileList);
  }

  private cleanupFileList(fileList: NzUploadFile[]): void {
    fileList.forEach(file => {
      if (file.url?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(file.url);
        } catch (error) {
          console.warn('Error limpiando URL:', error);
        }
      }
    });
  }

  // ===== MÉTODOS PARA EL TEMPLATE =====

  handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'assets/images/placeholder.png';
      img.onerror = null;
    }
  }

  formatDate(date?: Date | string): string {
    if (!date) return 'N/A';

    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(dateObj);
    } catch {
      return 'Fecha inválida';
    }
  }

  trackById(index: number, item: GenderSectionItem): string {
    return item?.id || `index-${index}`;
  }

  getCategoryLabel(category: string): string {
    const option = this.categoryOptions.find(opt => opt.value === category);
    return option?.label || category;
  }

  getStatusTag(item: GenderSectionItem): { color: string; text: string } {
    return item.isActive
      ? { color: 'green', text: 'Activo' }
      : { color: 'default', text: 'Inactivo' };
  }

  async forceResync(): Promise<void> {
    this.loading = true;
    this.cdr.markForCheck();

    try {
      // Recargar datos
      this.loadData();
      this.message.success('Datos actualizados correctamente');
    } catch (error) {
      this.message.error('Error al actualizar los datos');
    }
  }
}