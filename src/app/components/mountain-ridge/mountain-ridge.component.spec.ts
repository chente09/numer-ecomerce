import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MountainRidgeComponent } from './mountain-ridge.component';

describe('MountainRidgeComponent', () => {
  let component: MountainRidgeComponent;
  let fixture: ComponentFixture<MountainRidgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MountainRidgeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MountainRidgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
