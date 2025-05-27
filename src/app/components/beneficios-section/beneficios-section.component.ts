import { Component } from '@angular/core';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-beneficios-section',
  imports: [
    NzGridModule,
    NzIconModule
  ],
  templateUrl: './beneficios-section.component.html',
  styleUrl: './beneficios-section.component.css'
})
export class BeneficiosSectionComponent {

}
