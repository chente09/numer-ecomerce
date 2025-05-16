import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CuidadoProductoComponent } from './cuidado-producto.component';

describe('CuidadoProductoComponent', () => {
  let component: CuidadoProductoComponent;
  let fixture: ComponentFixture<CuidadoProductoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CuidadoProductoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CuidadoProductoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
