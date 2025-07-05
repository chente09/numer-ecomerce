import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DistributorManagementComponent } from './distributor-management.component';

describe('DistributorManagementComponent', () => {
  let component: DistributorManagementComponent;
  let fixture: ComponentFixture<DistributorManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DistributorManagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DistributorManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
