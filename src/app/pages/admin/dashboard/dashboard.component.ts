import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { UsersService } from '../../../services/users/users.service';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    NzSpinModule,
    CommonModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private usersService = inject(UsersService);
  private router = inject(Router);

  ngOnInit(): void {
    this.redirectUserByRole();
  }

  private async redirectUserByRole(): Promise<void> {
    const roles = await this.usersService.getUserRoles();
    
    if (roles.includes('admin')) {
      // Si es admin, lo mandamos a la gestión de productos
      this.router.navigate(['/admin/products']);
    } else if (roles.includes('distributor')) {
      // Si es distribuidor, a su inventario
      this.router.navigate(['/admin/my-inventory']);
    } else {
      // Si es otro rol, a la página principal
      this.router.navigate(['/welcome']);
    }
  }
}
