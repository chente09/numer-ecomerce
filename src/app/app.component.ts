import { Component } from '@angular/core';
import {  NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NavBarComponent } from "./components/nav-bar/nav-bar.component";
import { FooterComponent } from "./components/footer/footer.component";
import { WppComponent } from "./components/wpp/wpp.component";
import { filter, take } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ScrollService } from './services/scroll/scroll.service';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    RouterOutlet, 
    NzIconModule, 
    NzLayoutModule, 
    NzMenuModule, 
    NavBarComponent, 
    FooterComponent, 
    WppComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  showLayout = true; // Controla si se muestra el layout completo (navbar y footer)

  constructor(
    private router: Router,
    private scrollService: ScrollService
  ) {}

  ngOnInit(): void {
    // Escucha cambios en la navegación para ocultar el layout en rutas específicas
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd), take(1))
      .subscribe((event: NavigationEnd) => {
        // Oculta el layout si la ruta actual es '/cpanel' o '/formularios' o alguna de sus subrutas
        this.showLayout = !(
          event.url.startsWith('/admin') 
        );
      });
  }
}
