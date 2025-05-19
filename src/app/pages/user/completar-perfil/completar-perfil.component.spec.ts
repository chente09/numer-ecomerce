import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompletarPerfilComponent } from './completar-perfil.component';

describe('CompletarPerfilComponent', () => {
  let component: CompletarPerfilComponent;
  let fixture: ComponentFixture<CompletarPerfilComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompletarPerfilComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CompletarPerfilComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
