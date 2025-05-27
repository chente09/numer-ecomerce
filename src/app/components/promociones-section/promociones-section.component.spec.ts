import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PromocionesSectionComponent } from './promociones-section.component';

describe('PromocionesSectionComponent', () => {
  let component: PromocionesSectionComponent;
  let fixture: ComponentFixture<PromocionesSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromocionesSectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PromocionesSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
