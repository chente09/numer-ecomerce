import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IconosLargeSectionComponent } from './iconos-large-section.component';

describe('IconosLargeSectionComponent', () => {
  let component: IconosLargeSectionComponent;
  let fixture: ComponentFixture<IconosLargeSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconosLargeSectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IconosLargeSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
