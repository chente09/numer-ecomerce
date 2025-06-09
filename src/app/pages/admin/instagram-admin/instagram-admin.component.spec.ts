import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InstagramAdminComponent } from './instagram-admin.component';

describe('InstagramAdminComponent', () => {
  let component: InstagramAdminComponent;
  let fixture: ComponentFixture<InstagramAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InstagramAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InstagramAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
