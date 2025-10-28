import { TestBed } from '@angular/core/testing';

import { InscriptionServiceService } from './inscription.service.service';

describe('InscriptionServiceService', () => {
  let service: InscriptionServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InscriptionServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
