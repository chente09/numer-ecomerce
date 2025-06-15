import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmbajadoresAtletasComponent } from './embajadores-atletas.component';

describe('EmbajadoresAtletasComponent', () => {
  let component: EmbajadoresAtletasComponent;
  let fixture: ComponentFixture<EmbajadoresAtletasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmbajadoresAtletasComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmbajadoresAtletasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
