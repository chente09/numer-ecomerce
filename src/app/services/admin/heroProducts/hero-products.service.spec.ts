import { TestBed } from '@angular/core/testing';

import { HeroProductsService } from './hero-products.service';

describe('HeroProductsService', () => {
  let service: HeroProductsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HeroProductsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
