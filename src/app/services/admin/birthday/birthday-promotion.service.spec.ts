import { TestBed } from '@angular/core/testing';

import { BirthdayPromotionService } from './birthday-promotion.service';

describe('BirthdayPromotionService', () => {
  let service: BirthdayPromotionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BirthdayPromotionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
