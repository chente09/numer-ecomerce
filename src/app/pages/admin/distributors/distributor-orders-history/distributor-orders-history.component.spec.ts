import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DistributorOrdersHistoryComponent } from './distributor-orders-history.component';

describe('DistributorOrdersHistoryComponent', () => {
  let component: DistributorOrdersHistoryComponent;
  let fixture: ComponentFixture<DistributorOrdersHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DistributorOrdersHistoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DistributorOrdersHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
