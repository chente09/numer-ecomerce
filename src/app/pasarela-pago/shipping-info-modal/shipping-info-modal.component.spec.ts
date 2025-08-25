import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShippingInfoModalComponent } from './shipping-info-modal.component';

describe('ShippingInfoModalComponent', () => {
  let component: ShippingInfoModalComponent;
  let fixture: ComponentFixture<ShippingInfoModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShippingInfoModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShippingInfoModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
