import { Timestamp } from '@angular/fire/firestore';
import { CartItem } from '../pasarela-pago/services/cart/cart.service';

export interface Color {
    id: string;
    name: string;
    code: string;
    imageUrl?: string;
    description?: string;
}

export interface ColorStock {
    colorName: string;
    quantity: number;
}

export interface Size {
    id: string;
    name: string;
    stock?: number;
    imageUrl?: string;
    description?: string;
    active: boolean;
    categories?: string[];
    order?: number;
    colorStocks?: {
        colorName: string;
        quantity: number;
    }[];
}

export interface Promotion {
    id: string;
    name: string;
    description?: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    applicableProductIds?: string[];
    applicableCategories?: string[];
    minPurchaseAmount?: number;
    maxDiscountAmount?: number;
    usageLimit?: number;
    perCustomerLimit?: number;
}

export interface AppliedPromotion {
    promotionId: string;
    appliedAt: Date;
    appliedBy: string;
    target: 'product' | 'variant';
    targetId: string;
    expiresAt: Date;
}

export interface ProductVariant {
    id: string;
    productId: string;
    colorName: string;
    colorCode: string;
    sizeName: string;
    stock: number;
    sku: string;
    price?: number;
    distributorCost?: number; 
    imageUrl?: string;
    promotionId?: string;
    discountType?: 'percentage' | 'fixed';
    discountValue?: number;
    discountedPrice?: number;
    originalPrice?: number;
    checked?: boolean;
}
export interface AdditionalImageItem {
    file?: File;
    url: string;
    id: string;
    isExisting: boolean;
    toDelete?: boolean;
}

export interface Product {
    id: string;
    name: string;
    model: string;
    price: number;
    distributorCost?: number;
    gender?: 'man' | 'woman' | 'boy' | 'girl' | 'unisex';
    originalPrice?: number;
    currentPrice?: number;
    discountPercentage?: number;
    imageUrl: string;
    additionalImages?: string[];
    rating: number;
    category: string;
    categories: string[];
    technologies?: string[];
    description?: string;
    isNew?: boolean;
    isBestSeller?: boolean;
    colors: Color[];
    sizes: Size[];
    totalStock: number;
    sku: string;
    barcode?: string;
    season?: string;
    collection?: string;
    releaseDate?: Date;
    views: number;
    sales: number;
    lastRestockDate?: Date;
    popularityScore?: number;
    variants: ProductVariant[];
    tags: string[];
    metaTitle?: string;
    metaDescription?: string;
    searchKeywords?: string[];
    features?: string[];
    createdAt?: Date;
    updatedAt?: Date;
}

export interface ProductCreate {
    name: string;
    model: string;
    price: number;
    category: string;
    description?: string;
    sku: string;
    barcode?: string;
    season?: string;
    collection?: string;
    isNew?: boolean;
    isBestSeller?: boolean;
    metaTitle?: string;
    metaDescription?: string;
    colors: Color[];
    sizes: Size[];
    tags?: string[];
    searchKeywords?: string[];
    rating: number;
    totalStock: number;
    views: number;
    sales: number;
}

export interface ProductFilter {
    categories?: string[];
    minPrice?: number;
    maxPrice?: number;
    colors?: string[];
    sizes?: string[];
    tags?: string[];
    season?: string;
    collection?: string;
    isNew?: boolean;
    isBestSeller?: boolean;
    hasDiscount?: boolean;
    searchQuery?: string;
    sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'popular' | 'rating';
    page?: number;
    limit?: number;
    lastDoc?: any;
}

export interface PaginatedResult<T> {
    items: T[];
    totalCount: number;
    lastDoc?: any;
    hasMore: boolean;
}

export interface SaleItem {
    variantId: string;
    quantity: number;
    unitPrice?: number;
}

export interface Review {
    id?: string;
    name: string;
    location: string;
    rating: number;
    text: string;
    avatarUrl?: string;
    approved?: boolean;
    createdAt: Date;
    productId?: string;
}

export interface NavigationItem {
    id: string;
    icon: string;
    title: string;
    description: string;
    link: string;
    isExternal?: boolean;
    isActive?: boolean;
    order?: number;
}

export interface UserProfile {
    uid: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    emailVerified: boolean;
    isAnonymous: boolean;
    createdAt: Timestamp | Date;
    lastLogin: Timestamp | Date;
    roles: string[];
    firstName?: string;
    lastName?: string;
    phone?: string;
    birthDate?: Timestamp | Date;
    documentType?: string;
    documentNumber?: string;
    profileCompleted?: boolean;
    defaultAddress?: any;
    updatedAt?: Timestamp | Date;
}

export interface Order {
    id: string;
    orderId: string;
    distributorId?: string;
    userId?: string;
    items: CartItem[];
    total: number;
    status: 'pending_distributor_payment' | 'pending_payment' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'completed';
    paymentMethod: 'distributor_credit' | 'payphone' | string;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
}

// ✅ NUEVAS INTERFACES PARA EL LIBRO CONTABLE
export interface LedgerEntry {
    id?: string;
    distributorId: string;
    type: 'debit' | 'credit'; // debit = deuda, credit = pago
    amount: number;
    description: string;
    sourceId: string;
    sourceType: 'distributor_order' | 'manual_payment' | 'transfer';
    createdAt: Timestamp;
    createdBy: string; // UID del admin o 'system'
}

export interface LedgerSummary {
    totalDebit: number;  // Total adeudado
    totalCredit: number; // Total pagado
    balance: number;     // Saldo pendiente
}
