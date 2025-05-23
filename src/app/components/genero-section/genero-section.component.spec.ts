import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GeneroSectionComponent } from './genero-section.component';

describe('GeneroSectionComponent', () => {
  let component: GeneroSectionComponent;
  let fixture: ComponentFixture<GeneroSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeneroSectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GeneroSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
