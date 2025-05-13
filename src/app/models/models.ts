export interface Color {
    id: string;
    name: string;
    code: string;
    imageUrl: string;
}

export interface ColorStock {
    colorName: string;   // Nombre del color
    quantity: number;    // Cantidad disponible
}

export interface Size {
    name: string;        // S, M, L, XL, etc.
    stock: number;       // Cantidad disponible
    imageUrl?: string;   // URL de la imagen representativa de la talla
    colorStocks?: {      // Stock específico por color y talla
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
    applicableProductIds?: string[]; // IDs de productos a los que aplica la promoción
    applicableCategories?: string[]; // Categorías a las que aplica la promoción
    minPurchaseAmount?: number;      // Monto mínimo de compra para aplicar
    maxDiscountAmount?: number;      // Límite máximo del descuento (para porcentajes)
    usageLimit?: number;             // Límite de usos totales
    perCustomerLimit?: number;       // Límite de usos por cliente
}

export interface ProductVariant {
    id: string;
    productId: string;  // ID del producto al que pertenece
    colorName: string;
    colorCode: string;
    sizeName: string;
    stock: number;
    sku: string;
    price?: number;  // Precio específico de la variante (opcional)
    imageUrl?: string;
}

export interface Product {
    id: string;
    name: string;
    price: number;
    originalPrice?: number;
    currentPrice?: number;
    discountPercentage?: number;
    imageUrl: string;
    rating: number;
    category: string;
    description?: string;
    isNew?: boolean;
    isBestSeller?: boolean;
    colors: Color[];
    sizes: Size[];
    totalStock: number;
    sku: string;
    barcode?: string;
    season?: string;           // 'Spring 2025', 'Summer 2025', etc.
    collection?: string;       // 'Casual', 'Formal', 'Sport', etc.
    releaseDate?: Date;        // Fecha de lanzamiento del producto
    views: number;             // Número de veces que se ha visto
    sales: number;             // Número de unidades vendidas
    lastRestockDate?: Date;    // Última fecha de reabastecimiento
    popularityScore?: number;  // Puntuación calculada de popularidad
    promotions?: Promotion[];
    variants: ProductVariant[];
    tags: string[];
    metaTitle?: string;
    metaDescription?: string;
    searchKeywords?: string[];
    activePromotion?: string;
}

export interface ProductCreate {
    name: string;
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
    rating: number;  // Añade estas propiedades faltantes
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
    lastDoc?: any;  // Para la paginación de Firestore
    hasMore: boolean;
}