import { Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationStart, Params, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Subscription, debounceTime, distinctUntilChanged, filter, map } from 'rxjs';
import { Product } from '../../models/models';
import { resolveEffectivePrice } from '../../core/pricing';
import { Segment, highlight, normalize } from '../../core/search-engine';
import { SearchService } from '../../services/search/search.service';

interface SearchItem {
  commands: unknown[];
  queryParams?: Params;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])';

@Component({
  selector: 'app-search-overlay',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './search-overlay.component.html',
  styleUrl: './search-overlay.component.css'
})
export class SearchOverlayComponent implements OnDestroy {
  readonly search = inject(SearchService);
  private router = inject(Router);

  @ViewChild('input') private inputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('panel') private panelRef?: ElementRef<HTMLElement>;

  readonly query = signal('');
  readonly activeIndex = signal(-1);

  /** A query shorter than two letters shows the starting suggestions instead of results. */
  readonly canSearch = computed(() => normalize(this.query()).length >= 2);

  readonly result = computed(() => {
    this.search.version();
    return this.canSearch() ? this.search.run(this.query()) : null;
  });

  /** Everything the arrow keys can reach, in screen order: categories first, then products. */
  readonly items = computed<SearchItem[]>(() => {
    const result = this.result();
    if (!result) return [];
    return [
      ...result.categories.map(c => ({ commands: ['/shop'], queryParams: { category: c.category.id } })),
      ...result.products.map(h => ({ commands: ['/products', h.product.id] }))
    ];
  });

  readonly statusText = computed(() => {
    const result = this.result();
    if (!result) return '';
    const n = result.products.length + result.categories.length;
    return n === 0 ? 'Sin resultados' : `${result.total} ${result.total === 1 ? 'producto encontrado' : 'productos encontrados'}`;
  });

  private routerSub: Subscription;

  constructor() {
    // Lock the page scroll behind the panel and put the cursor in the field when it opens
    effect(() => {
      const open = this.search.isOpen();
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) setTimeout(() => this.inputRef?.nativeElement.focus(), 30);
      else this.reset();
    });
    // Count a search once the customer stops typing, not on every keystroke
    toObservable(this.query).pipe(
      debounceTime(1200),
      map(term => term.trim()),
      distinctUntilChanged(),
      filter(term => normalize(term).length >= 2),
      takeUntilDestroyed()
    ).subscribe(term => {
      // Without the product index every query looks empty: do not report a false "no results"
      if (this.search.status() !== 'ready') return;
      const found = this.search.run(term);
      this.search.track(term, found.total + found.categories.length);
    });
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationStart))
      .subscribe(() => this.search.close(false));
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.routerSub.unsubscribe();
  }

  /** "/" or Ctrl/Cmd+K opens the search from anywhere, unless the customer is typing in a field. */
  @HostListener('document:keydown', ['$event'])
  onGlobalKey(event: KeyboardEvent): void {
    if (this.search.isOpen()) return;
    const target = event.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const slash = event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey;
    const ctrlK = event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey);
    if (slash || ctrlK) {
      event.preventDefault();
      this.search.open();
    }
  }

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(-1);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.items().length;
    switch (event.key) {
      case 'ArrowDown':
        if (count) this.move(event, (this.activeIndex() + 1) % count);
        break;
      case 'ArrowUp':
        if (count) this.move(event, this.activeIndex() <= 0 ? count - 1 : this.activeIndex() - 1);
        break;
      case 'Enter':
        event.preventDefault();
        this.submit();
        break;
    }
  }

  /** Keeps Tab inside the panel while it is open. */
  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.search.close();
      return;
    }
    if (event.key !== 'Tab' || !this.panelRef) return;
    const nodes = Array.from(this.panelRef.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Enter: open the highlighted result, or the full results page for what was typed. */
  submit(): void {
    const active = this.items()[this.activeIndex()];
    if (active) {
      this.router.navigate(active.commands, { queryParams: active.queryParams });
      return;
    }
    if (!this.canSearch()) return;
    this.router.navigate(['/shop'], { queryParams: { search: this.query().trim() } });
  }

  clear(): void {
    this.reset();
    this.inputRef?.nativeElement.focus();
  }

  close(): void {
    this.search.close();
  }

  segments(text: string): Segment[] {
    return highlight(text, this.query());
  }

  price(product: Product) {
    return resolveEffectivePrice(product);
  }

  image(product: Product): string {
    return product.imageUrl || product.colors?.find(c => c.imageUrl)?.imageUrl || '';
  }

  optionId(index: number): string {
    return `search-option-${index}`;
  }

  get activeDescendant(): string | null {
    return this.activeIndex() >= 0 ? this.optionId(this.activeIndex()) : null;
  }

  private move(event: KeyboardEvent, index: number): void {
    event.preventDefault();
    this.activeIndex.set(index);
    document.getElementById(this.optionId(index))?.scrollIntoView({ block: 'nearest' });
  }

  private reset(): void {
    this.query.set('');
    this.activeIndex.set(-1);
  }
}
