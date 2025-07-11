import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserRolesManagementComponent } from './user-roles-management.component';

describe('UserRolesManagementComponent', () => {
  let component: UserRolesManagementComponent;
  let fixture: ComponentFixture<UserRolesManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserRolesManagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserRolesManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
