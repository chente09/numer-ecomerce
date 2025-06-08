import { TestBed } from '@angular/core/testing';

import { ModelImageService } from './model-image.service';

describe('ModelImageService', () => {
  let service: ModelImageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ModelImageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
