import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HeroProductsAdminComponent } from './hero-products-admin.component';

describe('HeroProductsAdminComponent', () => {
  let component: HeroProductsAdminComponent;
  let fixture: ComponentFixture<HeroProductsAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroProductsAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HeroProductsAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
