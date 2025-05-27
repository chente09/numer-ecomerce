import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TendenciasSectionComponent } from './tendencias-section.component';

describe('TendenciasSectionComponent', () => {
  let component: TendenciasSectionComponent;
  let fixture: ComponentFixture<TendenciasSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TendenciasSectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TendenciasSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
