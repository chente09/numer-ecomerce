import { TestBed } from '@angular/core/testing';

import { TelegramAdminService } from './telegram-admin.service';

describe('TelegramAdminService', () => {
  let service: TelegramAdminService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TelegramAdminService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
