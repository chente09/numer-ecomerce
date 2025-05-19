import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { profileCompletionGuard } from './profile-completion.guard';

describe('profileCompletionGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => profileCompletionGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
