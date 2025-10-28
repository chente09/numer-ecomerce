import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminRacesComponent } from './admin-races.component';

describe('AdminRacesComponent', () => {
  let component: AdminRacesComponent;
  let fixture: ComponentFixture<AdminRacesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminRacesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminRacesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
