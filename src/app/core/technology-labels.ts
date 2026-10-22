/**
 * Technologies are stored on a product in two shapes: an id of the `technologies` collection (what the admin form
 * saves today) or a slug such as "secado_rapido" (older products, and what the shop's dictionary was written for).
 * This resolves both to the readable name, so the shop, the admin and the SEO tags always agree.
 */

/** Names of the slugs the shop has always known, with their accents. Used when the collection has no match. */
export const LEGACY_TECHNOLOGY_LABELS: Record<string, string> = {
  secado_rapido: 'Secado Rápido',
  proteccion_uv: 'Protección UV',
  anti_transpirante: 'Anti-transpirante',
  impermeable: 'Impermeable',
  transpirable: 'Transpirable',
  anti_bacterial: 'Anti-bacterial',
  termico: 'Térmico',
  elastico: 'Elástico',
  resistente_viento: 'Resistente al viento',
  sin_costuras: 'Sin costuras',
  repelente_agua: 'Repelente al agua',
  anti_olor: 'Anti-olor',
  reflectivo: 'Reflectivo'
};

export interface TechnologyRecord {
  id: string;
  name: string;
}

/** "Secado Rápido" -> "secado_rapido" */
export function slugOf(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/[\s_-]+/g, '_');
}

/** "custom_rompe_vientos" -> "Custom rompe vientos" (last resort, when nothing else knows the value). */
export function readableSlug(value: string): string {
  const text = (value ?? '').replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface TechnologyResolver {
  /** Readable name for a stored value (id or slug). */
  label(value: string): string;
  /** Slug for a stored value, to look up descriptions written per slug. */
  slug(value: string): string;
  /** Unique readable names for a list of stored values, keeping the order. */
  labels(values: string[] | undefined | null): string[];
}

export function buildTechnologyResolver(records: TechnologyRecord[] = []): TechnologyResolver {
  const byId = new Map(records.map(r => [r.id, r.name]));
  const bySlug = new Map(records.map(r => [slugOf(r.name), r.name]));

  const label = (value: string): string => {
    const text = (value ?? '').trim();
    if (!text) return '';
    return byId.get(text)
      || bySlug.get(slugOf(text))
      || LEGACY_TECHNOLOGY_LABELS[slugOf(text)]
      || readableSlug(text);
  };

  return {
    label,
    slug: (value: string) => slugOf(byId.get((value ?? '').trim()) ?? value),
    labels: (values) => [...new Set((values ?? []).map(label).filter(Boolean))]
  };
}
