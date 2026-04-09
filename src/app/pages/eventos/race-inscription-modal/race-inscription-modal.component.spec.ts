import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RaceInscriptionModalComponent } from './race-inscription-modal.component';

describe('RaceInscriptionModalComponent', () => {
  let component: RaceInscriptionModalComponent;
  let fixture: ComponentFixture<RaceInscriptionModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RaceInscriptionModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RaceInscriptionModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
