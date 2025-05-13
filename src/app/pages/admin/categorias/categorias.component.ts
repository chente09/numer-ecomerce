import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { DomSanitizer } from '@angular/platform-browser';
import { CategoryService, Category } from '../../../services/admin/category/category.service';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';

@Component({
  selector: 'app-categorias',
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
    NzPopconfirmModule
  ],
  templateUrl: './categorias.component.html',
  styleUrl: './categorias.component.css'
})
export class CategoriasComponent implements OnInit {
  categories: Category[] = [];
  loading = false;
  saving = false;
  modalVisible = false;
  isEditMode = false;
  form: Partial<Category> = {};
  editingId: string | null = null;
  fileList: NzUploadFile[] = [];
  imageFile: File | null = null;

  imageErrorMessage: string | null = null;


  constructor(
    private categoryService: CategoryService,
    private message: NzMessageService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    this.fetchCategories();
  }

  fetchCategories(): void {
    this.loading = true;
    this.categoryService.getCategories().subscribe({
      next: (data) => {
        this.categories = data;
        this.loading = false;
      },
      error: (err) => {
        this.message.error('Error al cargar categorías.');
        this.loading = false;
      }
    });
  }

  openModal(): void {
    this.modalVisible = true;
    this.form = {};
    this.fileList = [];
    this.isEditMode = false;
    this.editingId = null;
    this.imageFile = null;
  }

  closeModal(): void {
    this.modalVisible = false;
  }

  beforeUpload = (file: NzUploadFile): boolean => {
  this.imageErrorMessage = null;

  const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif)$/i.test(file.name || '');
  if (!isImage) {
    this.imageErrorMessage = 'Solo puedes subir archivos de imagen (.jpg, .png, .gif).';
    return false;
  }

  // Usa originFileObj, pero si no existe, usa file directamente
  const actualFile = (file.originFileObj as File) || (file as any);

  // Validar si tiene propiedad size
  if (!actualFile || typeof actualFile.size !== 'number') {
    this.imageErrorMessage = 'El archivo es inválido o está corrupto.';
    return false;
  }

  const isLt2M = actualFile.size / 1024 / 1024 < 2;
  if (!isLt2M) {
    this.imageErrorMessage = 'La imagen debe pesar menos de 2MB.';
    return false;
  }

  // Crear vista previa
  try {
    const objectUrl = URL.createObjectURL(actualFile);
    this.fileList = [
      {
        uid: `${Date.now()}-${file.name}`,
        name: file.name || 'imagen.jpg',
        status: 'done',
        url: objectUrl
      }
    ];
    this.imageFile = actualFile;
  } catch (e) {
    this.imageErrorMessage = 'No se pudo cargar la vista previa.';
    return false;
  }

  return false;
};



  handlePreview = (file: NzUploadFile): void => {
    const fileUrl = file.url || file.thumbUrl;
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  handleRemove = (file: NzUploadFile): boolean => {
    this.fileList = [];
    this.imageFile = null;
    return true;
  };

  async handleSubmit(): Promise<void> {
    if (!this.form.name || !this.form.slug || !this.form.description) {
      this.message.warning('Todos los campos son obligatorios.');
      return;
    }

    if (!this.imageFile && !this.isEditMode) {
      this.message.warning('Debe seleccionar una imagen.');
      return;
    }

    this.saving = true;
    try {
      if (this.isEditMode && this.editingId) {
        await this.categoryService.updateCategory(
          this.editingId,
          this.form,
          this.imageFile || undefined
        );
        this.message.success('Categoría actualizada.');
      } else {
        await this.categoryService.createCategory(this.form as any, this.imageFile!);
        this.message.success('Categoría creada.');
      }
      this.modalVisible = false;
      this.fetchCategories();
    } catch (error: any) {
      this.message.error(error.message || 'Error al guardar.');
    } finally {
      this.saving = false;
    }
  }

  editCategory(category: Category): void {
    this.form = { ...category };
    this.editingId = category.id;
    this.isEditMode = true;
    this.modalVisible = true;

    // Mostrar la imagen actual en el fileList
    this.fileList = [
      {
        uid: '-1',
        name: 'imagen actual',
        status: 'done',
        url: category.imageUrl
      }
    ];
  }

  async deleteCategory(id: string): Promise<void> {
    try {
      await this.categoryService.deleteCategory(id);
      this.message.success('Categoría eliminada.');
      this.fetchCategories();
    } catch (error: any) {
      this.message.error(error.message || 'Error al eliminar.');
    }
  }
}