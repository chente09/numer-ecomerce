import { TestBed } from '@angular/core/testing';

import { ProductPriceService } from './product-price.service';

describe('ProductPriceService', () => {
  let service: ProductPriceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProductPriceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
