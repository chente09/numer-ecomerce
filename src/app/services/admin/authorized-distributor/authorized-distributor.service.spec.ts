import { TestBed } from '@angular/core/testing';

import { AuthorizedDistributorService } from './authorized-distributor.service';

describe('AuthorizedDistributorService', () => {
  let service: AuthorizedDistributorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthorizedDistributorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
