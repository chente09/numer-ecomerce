import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RespuestaPagoComponent } from './respuesta-pago.component';

describe('RespuestaPagoComponent', () => {
  let component: RespuestaPagoComponent;
  let fixture: ComponentFixture<RespuestaPagoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RespuestaPagoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RespuestaPagoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
