import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetalleProductoComponentComponent } from './detalle-producto-component.component';

describe('DetalleProductoComponentComponent', () => {
  let component: DetalleProductoComponentComponent;
  let fixture: ComponentFixture<DetalleProductoComponentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetalleProductoComponentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetalleProductoComponentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
