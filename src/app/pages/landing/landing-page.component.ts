import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of, take } from 'rxjs';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { ProductCardComponent } from '../../components/product-card/product-card.component';
import { Product } from '../../models/models';
import { ProductService } from '../../services/admin/product/product.service';
import { TechnologyService } from '../../services/admin/technology/technology.service';
import { SeoService } from '../../services/seo/seo.service';
import { environment } from '../../../environments/environment';
import { LANDING_PAGES, LandingContent, buildLanding } from '../../core/landing-pages';
import { buildTechnologyResolver } from '../../core/technology-labels';

@Component({
  selector: 'app-landing-page',
  imports: [CommonModule, RouterLink, NzSpinModule, ProductCardComponent],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandingPageComponent implements OnInit {
  content: LandingContent | null = null;
  products: Product[] = [];

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private technologyService: TechnologyService,
    private seo: SeoService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.data['landing'] as string;
    const def = LANDING_PAGES.find(page => page.path === `/${slug}`);
    if (!def) return;

    forkJoin([
      this.productService.getProducts().pipe(take(1)),
      this.technologyService.getTechnologies().pipe(take(1))
    ]).pipe(catchError(() => of([[], []] as [Product[], any[]]))).subscribe(([products, technologies]) => {
      const resolver = buildTechnologyResolver(technologies);
      this.content = buildLanding(
        def,
        products.map(product => ({ product: product as any, technologyNames: resolver.labels(product.technologies) })),
        { siteUrl: environment.siteUrl || 'https://numer.store' }
      );
      const featuredIds = new Set(this.content.featured.map(f => f.id));
      this.products = products.filter(p => featuredIds.has(p.id));
      this.seo.applyLandingSEO(this.content);
      this.cdr.markForCheck();
    });
  }
}
