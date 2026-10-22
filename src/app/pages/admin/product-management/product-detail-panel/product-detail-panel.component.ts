import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { Product } from '../../../../models/models';
import { resolveEffectivePrice } from '../../../../core/pricing';
import {
  HealthResult, PromotionInfo, SEO_DESCRIPTION_RANGE, SEO_TITLE_RANGE, SeoState, StockMatrix,
  buildStockMatrix, genderLabel, healthChecks, promotionInfo, seoLengthState, toDate
} from '../../../../core/product-insights';
import { Category } from '../../../../services/admin/category/category.service';
import { TechnologyService } from '../../../../services/admin/technology/technology.service';

export type PanelTab = 'summary' | 'stock' | 'price' | 'catalog';

const PROMOTION_LABELS = {
  none: 'Sin promoción',
  active: 'Vigente',
  paused: 'Pausada',
  expired: 'Vencida',
  scheduled: 'Programada'
} as const;

const slugOf = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/[\s_-]+/g, '_');

const readable = (value: string): string => {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const SEO_LABELS: Record<SeoState, string> = { empty: 'Falta', short: 'Corto', ok: 'Bien', long: 'Largo' };

/**
 * Everything about one product in the admin list, unfolded under its row. Desktop shows every block at once;
 * a phone shows one block at a time through the tabs, so there is never a long scroll.
 */
@Component({
  selector: 'app-product-detail-panel',
  standalone: true,
  imports: [CommonModule, NzButtonModule, NzIconModule, NzPopconfirmModule],
  templateUrl: './product-detail-panel.component.html',
  styleUrl: './product-detail-panel.component.css'
})
export class ProductDetailPanelComponent implements OnInit, OnChanges {
  private cdr = inject(ChangeDetectorRef);
  private technologyService = inject(TechnologyService);

  @Input({ required: true }) product!: Product;
  @Input() categories: Category[] = [];

  @Output() edit = new EventEmitter<void>();
  @Output() inventory = new EventEmitter<void>();
  @Output() promotions = new EventEmitter<void>();
  @Output() stats = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();

  readonly tabs: { id: PanelTab; label: string }[] = [
    { id: 'summary', label: 'Resumen' },
    { id: 'stock', label: 'Stock' },
    { id: 'price', label: 'Precio' },
    { id: 'catalog', label: 'Catálogo' }
  ];
  tab: PanelTab = 'summary';
  /** Starts false so the panel can animate open on the next frame. */
  open = false;
  descriptionExpanded = false;

  matrix!: StockMatrix;
  promo!: PromotionInfo;
  health!: HealthResult;
  price = resolveEffectivePrice(null);
  categoryNames: string[] = [];
  technologyNames: string[] = [];
  gallery: string[] = [];
  extraImages = 0;
  seoTitle: { text: string; state: SeoState } = { text: '', state: 'empty' };
  seoDescription: { text: string; state: SeoState } = { text: '', state: 'empty' };
  readonly seoTitleRange = SEO_TITLE_RANGE;
  readonly seoDescriptionRange = SEO_DESCRIPTION_RANGE;

  private technologyById = new Map<string, string>();
  private technologyBySlug = new Map<string, string>();

  constructor() {
    this.technologyService.getTechnologies().pipe(takeUntilDestroyed()).subscribe(list => {
      this.technologyById = new Map(list.map(t => [t.id, t.name]));
      this.technologyBySlug = new Map(list.map(t => [slugOf(t.name), t.name]));
      this.resolveTechnologies();
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) this.open = true;
    else setTimeout(() => { this.open = true; this.cdr.markForCheck(); }, 16);
  }

  ngOnChanges(): void {
    const p = this.product;
    if (!p) return;
    this.matrix = buildStockMatrix(p);
    this.promo = promotionInfo(p);
    this.health = healthChecks(p);
    this.price = resolveEffectivePrice(p);
    this.categoryNames = (p.categories?.length ? p.categories : p.category ? [p.category] : [])
      .map(id => this.categories.find(c => c.id === id)?.name || id);
    this.resolveTechnologies();

    const images = [p.imageUrl, ...(p.additionalImages ?? [])].filter((u): u is string => !!u);
    const unique = [...new Set(images)];
    this.gallery = unique.slice(0, 5);
    this.extraImages = Math.max(0, unique.length - this.gallery.length);

    this.seoTitle = { text: (p.metaTitle ?? '').trim(), state: seoLengthState(p.metaTitle, ...SEO_TITLE_RANGE) };
    this.seoDescription = { text: (p.metaDescription ?? '').trim(), state: seoLengthState(p.metaDescription, ...SEO_DESCRIPTION_RANGE) };
  }

  private resolveTechnologies(): void {
    // Older products store a slug ("secado_rapido") instead of the id of the technology: match it by name, and
    // when nothing matches show the slug as readable text instead of a code
    const names = (this.product?.technologies ?? []).map(value =>
      this.technologyById.get(value) || this.technologyBySlug.get(slugOf(value)) || readable(value));
    this.technologyNames = [...new Set(names)];
  }

  setTab(tab: PanelTab): void {
    this.tab = tab;
  }

  // ── Presentation helpers ───────────────────────────────────────────────────────
  get gender(): string {
    return genderLabel(this.product.gender);
  }

  /** Why the stock matrix is empty: a product without variants cannot be bought, and the admin should know it. */
  get noVariantsMessage(): string {
    const colors = this.product.colors?.length ?? 0;
    const sizes = this.product.sizes?.length ?? 0;
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    if (colors && sizes) {
      return `Tiene ${count(colors, 'color', 'colores')} y ${count(sizes, 'talla', 'tallas')}, pero no se generaron las variantes: ` +
        'no se puede comprar. Genéralas desde el editor.';
    }
    if (colors) return `Tiene ${count(colors, 'color', 'colores')} pero ninguna talla: no hay variantes y no se puede comprar. Agrega tallas desde el editor.`;
    if (sizes) return `Tiene ${count(sizes, 'talla', 'tallas')} pero ningún color: no hay variantes y no se puede comprar. Agrega colores desde el editor.`;
    return 'Sin colores ni tallas: todavía no se puede comprar. Agrégalos desde el editor.';
  }

  get promoLabel(): string {
    return PROMOTION_LABELS[this.promo.state];
  }

  /** One sentence that says what the customer pays and why. */
  get priceExplanation(): string {
    const state = this.promo.state;
    const hasStoredOffer = !!this.product.promotionId || (this.product.currentPrice ?? 0) < (this.product.originalPrice ?? 0);
    if (state === 'paused' && hasStoredOffer) return 'La promoción está pausada: la tienda cobra el precio regular.';
    if (state === 'expired' && hasStoredOffer) return 'La promoción venció: la tienda cobra el precio regular.';
    if (state === 'scheduled' && hasStoredOffer) return 'La promoción aún no empieza: la tienda cobra el precio regular.';
    return '';
  }

  get promoDates(): string {
    const { start, end, state } = this.promo;
    if (state === 'scheduled' && start) return `Desde el ${this.shortDate(start)}`;
    if (state === 'expired' && end) return `Terminó el ${this.shortDate(end)}`;
    if (end) return `Hasta el ${this.shortDate(end)}`;
    return '';
  }

  seoLabel(state: SeoState): string {
    return SEO_LABELS[state];
  }

  shortDate(value: unknown): string {
    const date = toDate(value);
    return date ? date.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }

  get lastSale(): unknown {
    return (this.product as unknown as { lastSaleAt?: unknown }).lastSaleAt;
  }

  get visibleIssues(): string[] {
    return this.health.issues.slice(0, 4);
  }

  get hiddenIssues(): number {
    return Math.max(0, this.health.issues.length - 4);
  }

  get healthPercent(): number {
    return Math.round((this.health.passed / this.health.total) * 100);
  }

  get shopLink(): string {
    return `/products/${this.product.id}`;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
