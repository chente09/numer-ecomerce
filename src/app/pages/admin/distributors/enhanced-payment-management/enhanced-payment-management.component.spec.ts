import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EnhancedPaymentManagementComponent } from './enhanced-payment-management.component';

describe('EnhancedPaymentManagementComponent', () => {
  let component: EnhancedPaymentManagementComponent;
  let fixture: ComponentFixture<EnhancedPaymentManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnhancedPaymentManagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EnhancedPaymentManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
