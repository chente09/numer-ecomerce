import { TestBed } from '@angular/core/testing';

import { PromotionStateService } from './promotion-state.service';

describe('PromotionStateService', () => {
  let service: PromotionStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PromotionStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
