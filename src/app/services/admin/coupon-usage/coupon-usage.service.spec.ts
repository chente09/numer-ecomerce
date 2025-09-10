import { TestBed } from '@angular/core/testing';

import { CouponUsageService } from './coupon-usage.service';

describe('CouponUsageService', () => {
  let service: CouponUsageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CouponUsageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
