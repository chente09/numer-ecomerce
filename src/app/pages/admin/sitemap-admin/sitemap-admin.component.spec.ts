import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SitemapAdminComponent } from './sitemap-admin.component';

describe('SitemapAdminComponent', () => {
  let component: SitemapAdminComponent;
  let fixture: ComponentFixture<SitemapAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SitemapAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SitemapAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
