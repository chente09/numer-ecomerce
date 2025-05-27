import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-iconos-large-section',
  imports: [
    CommonModule,
    FormsModule,
    NzIconModule
  ],
  templateUrl: './iconos-large-section.component.html',
  styleUrl: './iconos-large-section.component.css'
})
export class IconosLargeSectionComponent {

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

}
