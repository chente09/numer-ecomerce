import { TestBed } from '@angular/core/testing';

import { PromotionDiagnosticService } from './promotion-diagnostic.service';

describe('PromotionDiagnosticService', () => {
  let service: PromotionDiagnosticService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PromotionDiagnosticService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
