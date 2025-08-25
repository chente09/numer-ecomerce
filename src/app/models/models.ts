import { Timestamp } from '@angular/fire/firestore';

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

    // 🚀 NUEVO: Distingue entre promociones generales y cupones específicos.
    promotionType: 'standard' | 'coupon';

    // Ahora incluye 'shipping' para envíos gratis.
    discountType: 'percentage' | 'fixed' | 'shipping';
    discountValue: number; // Para 'shipping', el valor puede ser 0, la lógica se encarga del resto.

    startDate: Date;
    endDate: Date;
    isActive: boolean;

    // --- Campos Específicos para Cupones ---
    couponCode?: string; // El código que el cliente usará. Ej: "BIENVENIDA10"
    couponType?: 'SHIPPING' | 'REFERRAL' | 'WELCOME' | 'SEASONAL' | 'VIP' | 'BULK';

    usageLimits?: {
        global?: number;   // Límite total de usos del cupón.
        perUser?: number;  // Límite de usos por cada cliente.
        perDay?: number;   // Límite de usos por día (menos común, pero posible).
    };
    // --- Fin de Campos de Cupones ---


    // --- Reglas de Aplicabilidad (sin cambios) ---
    applicableProductIds?: string[];
    applicableCategories?: string[];
    minPurchaseAmount?: number; // Requerimiento para compra mínima (BULK)
    maxDiscountAmount?: number; // Límite de descuento para tipo 'percentage'
}

// ✅ NUEVO: Interfaz para rastrear el uso de cupones por usuario.
export interface CouponUsage {
    id?: string; // Compuesto: userId_couponCode
    userId: string;
    couponCode: string;
    promotionId: string;
    usageCount: number;
    lastUsedAt: Date;
    orderIds: string[]; // Para rastrear en qué pedidos se usó
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
    discountType?: 'percentage' | 'fixed' | 'shipping';
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

export interface CartItem {
    productId: string;
    variantId: string;
    quantity: number;
    product?: Product;
    variant?: ProductVariant;
    unitPrice: number; // Precio final CON descuento
    totalPrice: number;
    originalUnitPrice?: number; // Precio original sin descuento
    appliedPromotionTitle?: string; // Nombre de la promoción
}

export interface Cart {
    items: CartItem[];
    totalItems: number;
    subtotal: number;
    tax: number;
    shipping: number;
    discount: number; // Para descuentos manuales por código
    totalSavings: number; // Para ahorros por promociones automáticas
    total: number;
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

// =====================================
// ✅ INTERFACES PARA EL LIBRO CONTABLE EXTENDIDO
// =====================================

// Interface base existente - EXTENDIDA
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

    // ✅ NUEVOS CAMPOS PARA CONTROL MEJORADO
    paymentStatus?: 'pending' | 'paid' | 'partial' | 'overdue';
    paidAmount?: number;
    paymentDate?: Timestamp;
    paymentVoucher?: string; // URL del comprobante subido
    paymentNotes?: string;
    dueDate?: Timestamp;
    relatedTransferId?: string; // Vincula débitos con transferencias específicas

    // Campos para pagos parciales
    remainingAmount?: number;
    isPartialPayment?: boolean;
    parentDebitId?: string; // Para pagos parciales, referencia al débito original
}

// Interface base existente
export interface LedgerSummary {
    totalDebit: number;  // Total adeudado
    totalCredit: number; // Total pagado
    balance: number;     // Saldo pendiente
}

// ✅ NUEVA: Interface para resumen extendido
export interface EnhancedLedgerSummary extends LedgerSummary {
    totalDebit: number;
    totalCredit: number;
    balance: number;

    // Nuevos campos extendidos
    pendingAmount: number;
    paidAmount: number;
    overdueAmount: number;
    partialPayments: number;
    totalTransactions: number;
    averageDebtAge: number; // En días
    oldestUnpaidDate?: Date;
    lastPaymentDate?: Date;
}

// ✅ NUEVA: Interface para detalles extendidos de pagos
export interface PaymentDetails {
    id?: string;
    ledgerEntryId: string;
    distributorId: string;
    amount: number;
    voucherFile?: File;
    voucherUrl?: string;
    paymentMethod: 'cash' | 'bank_transfer' | 'check' | 'online' | 'other';
    bankReference?: string;
    notes: string;
    paidDate: Date;
    registeredBy: string;
    createdAt: Timestamp;
    updatedAt?: Timestamp;

    // ✅ CAMPO PARA VINCULAR PAGOS PARCIALES
    parentDebitId?: string; // Para pagos parciales, referencia al débito original
}

// ✅ NUEVA: Interface para filtros de reportes
export interface PaymentReportFilter {
    distributorId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    paymentStatus?: 'pending' | 'paid' | 'partial' | 'overdue' | 'all';
    paymentMethod?: string;
    sourceType?: 'distributor_order' | 'manual_payment' | 'transfer' | 'all';
    minAmount?: number;
    maxAmount?: number;
}

// ✅ NUEVA: Interface para datos de reporte
export interface PaymentReportData {
    entries: LedgerEntry[];
    summary: EnhancedLedgerSummary;
    distributorName?: string;
    periodDescription: string;
    generatedAt: Date;
    generatedBy: string;
}