/**
 * Registro tipado de "operaciones optimistas pendientes" (cambio aplicado en UI antes de
 * confirmar con el servidor, con backup para poder revertir si falla).
 *
 * Misma API que `Map` a propósito: es un reemplazo directo de los `Map<string, T>` que
 * product-inventory, product-management y product-form usaban cada uno por su cuenta
 * para este mismo propósito. Cada pantalla sigue siendo dueña de su propia lógica de
 * negocio (qué hacer al confirmar/revertir) — esto solo centraliza el almacenamiento.
 */
export class PendingOperationsStore<TKey, TOperation> {
  private operations = new Map<TKey, TOperation>();

  set(key: TKey, operation: TOperation): this {
    this.operations.set(key, operation);
    return this;
  }

  get(key: TKey): TOperation | undefined {
    return this.operations.get(key);
  }

  has(key: TKey): boolean {
    return this.operations.has(key);
  }

  delete(key: TKey): boolean {
    return this.operations.delete(key);
  }

  clear(): void {
    this.operations.clear();
  }

  get size(): number {
    return this.operations.size;
  }
}
