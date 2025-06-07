import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelsSectionComponent } from './models-section.component';

describe('ModelsSectionComponent', () => {
  let component: ModelsSectionComponent;
  let fixture: ComponentFixture<ModelsSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelsSectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModelsSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
