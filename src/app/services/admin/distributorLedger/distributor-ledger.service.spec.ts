import { TestBed } from '@angular/core/testing';

import { DistributorLedgerService } from './distributor-ledger.service';

describe('DistributorLedgerService', () => {
  let service: DistributorLedgerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DistributorLedgerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
