import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductosSectionComponent } from './productos-section.component';

describe('ProductosSectionComponent', () => {
  let component: ProductosSectionComponent;
  let fixture: ComponentFixture<ProductosSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductosSectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductosSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
