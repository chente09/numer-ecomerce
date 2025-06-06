import { TestBed } from '@angular/core/testing';

import { GenderSectionService } from './gender-section.service';

describe('GenderSectionService', () => {
  let service: GenderSectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GenderSectionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
