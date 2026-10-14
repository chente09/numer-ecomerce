import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener,
  Input, OnDestroy, Output, ViewChild
} from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';

/**
 * Product image gallery: thumbnail strip, hover lens zoom on desktop, swipe on touch devices and a
 * full-screen viewer with keyboard navigation. Pure Angular + CSS, no external library.
 */
@Component({
  selector: 'app-product-gallery',
  standalone: true,
  imports: [CommonModule, NzIconModule],
  templateUrl: './product-gallery.component.html',
  styleUrl: './product-gallery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductGalleryComponent implements OnDestroy {
  /** Zoom level of the hover lens and of the full-screen viewer. */
  readonly ZOOM = 2.5;
  private readonly SWIPE_THRESHOLD = 40;

  @Input() images: string[] = [];
  @Input() alt = '';
  @Input() activeUrl = '';
  @Output() activeUrlChange = new EventEmitter<string>();

  @ViewChild('viewer') viewerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('lightbox') lightboxRef?: ElementRef<HTMLDivElement>;

  lensActive = false;
  originX = 50;
  originY = 50;

  lightboxOpen = false;
  lightboxZoomed = false;

  private touchStartX = 0;
  private touchStartY = 0;
  private swiped = false;

  constructor(private cdr: ChangeDetectorRef) { }

  get index(): number {
    const i = this.images.indexOf(this.activeUrl);
    return i >= 0 ? i : 0;
  }

  get current(): string {
    return this.images[this.index] || this.activeUrl || '';
  }

  get hasMany(): boolean {
    return this.images.length > 1;
  }

  select(i: number): void {
    const count = this.images.length;
    if (count === 0) return;
    const next = (i + count) % count;
    this.lightboxZoomed = false;
    this.activeUrlChange.emit(this.images[next]);
  }

  prev(event?: Event): void {
    event?.stopPropagation();
    this.select(this.index - 1);
  }

  next(event?: Event): void {
    event?.stopPropagation();
    this.select(this.index + 1);
  }

  // ── Hover lens (mouse only) ──

  onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.originX = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    this.originY = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    this.lensActive = true;
    this.cdr.markForCheck();
  }

  onPointerLeave(): void {
    if (!this.lensActive) return;
    this.lensActive = false;
    this.cdr.markForCheck();
  }

  // ── Swipe (touch) ──

  onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
    this.swiped = false;
  }

  onTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    if (this.hasMany && Math.abs(dx) > this.SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      this.swiped = true;
      dx < 0 ? this.next() : this.prev();
    }
  }

  // ── Full-screen viewer ──

  openLightbox(): void {
    // A swipe also ends in a click on touch devices: it must not open the viewer
    if (this.swiped) {
      this.swiped = false;
      return;
    }
    this.lightboxOpen = true;
    this.lightboxZoomed = false;
    document.body.style.overflow = 'hidden';
    // The gallery is sticky (its own stacking context): moving the viewer to <body> lets it sit above
    // the header and floating buttons instead of being trapped under them.
    this.cdr.detectChanges();
    const el = this.lightboxRef?.nativeElement;
    if (el) document.body.appendChild(el);
  }

  closeLightbox(): void {
    this.lightboxOpen = false;
    this.lightboxZoomed = false;
    document.body.style.overflow = '';
  }

  toggleLightboxZoom(event?: Event): void {
    event?.stopPropagation();
    this.lightboxZoomed = !this.lightboxZoomed;
    // Center the zoomed image so panning starts from the middle
    setTimeout(() => {
      const el = this.viewerRef?.nativeElement;
      if (!el) return;
      if (this.lightboxZoomed) {
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
        el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
      }
    });
    this.cdr.markForCheck();
  }

  /** Desktop: moving the mouse pans the zoomed image (touch uses native scrolling). */
  onViewerPointerMove(event: PointerEvent): void {
    if (!this.lightboxZoomed || event.pointerType !== 'mouse') return;
    const el = this.viewerRef?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) * px;
    el.scrollTop = (el.scrollHeight - el.clientHeight) * py;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.lightboxOpen) return;
    if (event.key === 'Escape') {
      this.closeLightbox();
    } else if (event.key === 'ArrowLeft') {
      this.prev();
    } else if (event.key === 'ArrowRight') {
      this.next();
    }
    this.cdr.markForCheck();
  }

  trackByUrl(_: number, url: string): string {
    return url;
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.lightboxRef?.nativeElement.remove();
  }
}
