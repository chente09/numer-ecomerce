import { TestBed } from '@angular/core/testing';

import { WhatsAppAdminService } from './whats-app-admin.service';

describe('WhatsAppAdminService', () => {
  let service: WhatsAppAdminService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WhatsAppAdminService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
