import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BeneficiosSectionComponent } from './beneficios-section.component';

describe('BeneficiosSectionComponent', () => {
  let component: BeneficiosSectionComponent;
  let fixture: ComponentFixture<BeneficiosSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BeneficiosSectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BeneficiosSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
