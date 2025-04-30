import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PayphoneFormComponent } from './payphone-form.component';

describe('PayphoneFormComponent', () => {
  let component: PayphoneFormComponent;
  let fixture: ComponentFixture<PayphoneFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PayphoneFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PayphoneFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
