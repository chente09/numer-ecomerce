import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MovementHistoryComponentComponent } from './movement-history-component.component';

describe('MovementHistoryComponentComponent', () => {
  let component: MovementHistoryComponentComponent;
  let fixture: ComponentFixture<MovementHistoryComponentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MovementHistoryComponentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MovementHistoryComponentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
