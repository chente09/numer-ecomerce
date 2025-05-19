import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UsersService } from '../../../services/users/users.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzGridModule } from 'ng-zorro-antd/grid';

@Component({
  selector: 'app-completar-perfil',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzGridModule
  ],
  templateUrl: './completar-perfil.component.html',
  styleUrl: './completar-perfil.component.css'
})
export class CompletarPerfilComponent implements OnInit {

  profileForm: FormGroup;
  isSubmitting = false;

  constructor(
    private fb: FormBuilder,
    private usersService: UsersService,
    private message: NzMessageService,
    private router: Router
  ) {
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      phone: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
      // Campos de dirección
      address: ['', Validators.required],
      city: ['', Validators.required],
      province: ['', Validators.required],
      postalCode: ['', Validators.required]
    });
  }
  
  ngOnInit() {
    // Cargar datos existentes si los hay
    // Comprobar si el usuario está autenticado
  }
  
  async onSubmit() {
    if (this.profileForm.invalid) return;
    
    this.isSubmitting = true;
    
    try {
      // Guardar datos en Firestore
      const user = this.usersService.getCurrentUser();
      if (!user) throw new Error('Usuario no autenticado');
      
      // Preparar datos para guardar
      const userData = {
        ...this.profileForm.value,
        uid: user.uid,
        profileCompleted: true,
        updatedAt: new Date()
      };
      
      // Guardar en Firestore (implementar este método en UsersService)
      await this.saveUserProfile(userData);
      
      this.message.success('Perfil actualizado correctamente');
      this.router.navigate(['/perfil']);
    } catch (error) {
      console.error('Error al guardar perfil:', error);
      this.message.error('No se pudo guardar la información. Intente nuevamente.');
    } finally {
      this.isSubmitting = false;
    }
  }
  
  // Método para guardar el perfil (deberías implementarlo en tu UsersService)
  private async saveUserProfile(userData: any): Promise<void> {
    // Implementación para guardar datos en Firestore
  }
  
}
