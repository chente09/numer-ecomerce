import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenderSectionAdminComponent } from './gender-section-admin.component';

describe('GenderSectionAdminComponent', () => {
  let component: GenderSectionAdminComponent;
  let fixture: ComponentFixture<GenderSectionAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenderSectionAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GenderSectionAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
