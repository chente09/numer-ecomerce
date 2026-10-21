import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Product } from '../../models/models';
import { Category, CategoryService } from '../admin/category/category.service';
import { ProductService } from '../admin/product/product.service';
import {
  CategoryHit, IndexedProduct, SearchHit, buildIndex, countMatches, searchCategories, searchProducts
} from '../../core/search-engine';

export interface SearchResult {
  products: SearchHit<Product>[];
  categories: CategoryHit<Category>[];
  /** Products matching the query, including the ones not listed. */
  total: number;
}

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

const EMPTY: SearchResult = { products: [], categories: [], total: 0 };
/** The index is rebuilt in the background when the panel opens after this long. */
const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * State of the header search panel and the product index behind it. Products come from the same cached
 * source the shop uses, so opening the search does not add a second download.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);

  readonly isOpen = signal(false);
  readonly status = signal<SearchStatus>('idle');
  /** Bumped every time the index is rebuilt so results recompute. */
  readonly version = signal(0);
  readonly categories = signal<Category[]>([]);

  private index: IndexedProduct<Product>[] = [];
  private categoryNames = new Map<string, string>();
  private loadedAt = 0;
  private opener: HTMLElement | null = null;

  /** `opener` is the control that was used, so the focus can return to it (Safari does not focus buttons on tap). */
  open(opener?: HTMLElement | null): void {
    this.opener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.isOpen.set(true);
    if (this.status() !== 'ready' || Date.now() - this.loadedAt > STALE_AFTER_MS) void this.load();
  }

  /** `restoreFocus` is false when leaving the page: the focus belongs to the new page then. */
  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    // Hand the focus back to the control that opened the panel (keyboard and screen reader users)
    if (restoreFocus) this.opener?.focus?.();
    this.opener = null;
  }

  retry(): void {
    void this.load();
  }

  async load(): Promise<void> {
    if (this.status() === 'loading') return;
    // Keep showing the previous index while it refreshes in the background
    if (this.status() !== 'ready') this.status.set('loading');
    try {
      const [products, categories] = await Promise.all([
        firstValueFrom(this.productService.getProducts()),
        firstValueFrom(this.categoryService.getCategories())
      ]);
      this.categoryNames = new Map(categories.map(c => [c.id, c.name]));
      this.categories.set(categories);
      this.index = buildIndex(products, categories);
      this.loadedAt = Date.now();
      this.status.set('ready');
      this.version.update(v => v + 1);
    } catch (error) {
      console.error('Search: could not load the products', error);
      if (this.status() !== 'ready') this.status.set('error');
    }
  }

  run(query: string, limit = 6): SearchResult {
    if (this.status() !== 'ready') return EMPTY;
    const products = searchProducts(this.index, query, limit);
    const categories = searchCategories(this.categories(), query);
    if (products.length === 0 && categories.length === 0) return EMPTY;
    return { products, categories, total: countMatches(this.index, query) };
  }

  categoryLabel(product: Product): string {
    return this.categoryNames.get(product.category) ?? '';
  }
}
