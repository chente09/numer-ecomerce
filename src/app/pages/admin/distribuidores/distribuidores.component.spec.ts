import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DistribuidoresComponent } from './distribuidores.component';

describe('DistribuidoresComponent', () => {
  let component: DistribuidoresComponent;
  let fixture: ComponentFixture<DistribuidoresComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DistribuidoresComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DistribuidoresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
