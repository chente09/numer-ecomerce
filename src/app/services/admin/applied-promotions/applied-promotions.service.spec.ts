import { TestBed } from '@angular/core/testing';

import { AppliedPromotionsService } from './applied-promotions.service';

describe('AppliedPromotionsService', () => {
  let service: AppliedPromotionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AppliedPromotionsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
