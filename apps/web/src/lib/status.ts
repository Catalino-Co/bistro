import type { BadgeTone } from './components/Badge.svelte';

export interface StatusLabel {
  label: string;
  tone: BadgeTone;
}

// Los enums de la base viven en inglés (`available`, `occupied`, `open`...)
// y hoy se pintan crudos en pantalla, en una app que por lo demás está
// completamente en español. La traducción se centraliza aquí para que no
// vuelva a escribirse a mano en cada pantalla.

export const DINE_TABLE_STATUS: Record<string, StatusLabel> = {
  available: { label: 'Libre', tone: 'success' },
  occupied: { label: 'Ocupada', tone: 'warning' },
  reserved: { label: 'Reservada', tone: 'primary' },
};

export const ORDER_STATUS: Record<string, StatusLabel> = {
  open: { label: 'Abierta', tone: 'warning' },
  closed: { label: 'Cerrada', tone: 'success' },
};

export const DISPATCH_MODE: Record<string, StatusLabel> = {
  dine_in: { label: 'En mesa', tone: 'neutral' },
  delivery: { label: 'Delivery', tone: 'primary' },
  pickup: { label: 'Pickup', tone: 'primary' },
  room_service: { label: 'Room service', tone: 'primary' },
};

export const ACTIVE_STATUS: Record<string, StatusLabel> = {
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
};

const UNKNOWN: StatusLabel = { label: '—', tone: 'neutral' };

export function statusLabel(map: Record<string, StatusLabel>, key: string | null): StatusLabel {
  return (key !== null ? map[key] : undefined) ?? UNKNOWN;
}

/**
 * El estado de un ítem del catálogo sale de dos columnas, igual que el de una
 * línea: archivado gana sobre el status, porque archivar fuerza `inactive` y
 * lo que hay que mostrar es el retiro, no la pausa.
 */
export function itemState(item: { status: string; archivedAt: string | null }): StatusLabel {
  if (item.archivedAt) return { label: 'Archivado', tone: 'neutral' };
  if (item.status === 'active') return { label: 'Activo', tone: 'success' };
  return { label: 'Inactivo', tone: 'warning' };
}

/**
 * Lo mismo para un nivel del árbol, que en los tres casos es femenino:
 * familia, subfamilia y categoría. Compartir `itemState` dejaba «Inactivo»
 * bajo un filtro que dice «Inactivas».
 */
export function treeNodeState(node: { status: string; archivedAt: string | null }): StatusLabel {
  if (node.archivedAt) return { label: 'Archivada', tone: 'neutral' };
  if (node.status === 'active') return { label: 'Activa', tone: 'success' };
  return { label: 'Inactiva', tone: 'warning' };
}

/**
 * El estado de una línea no es una columna: sale de la combinación de
 * `voidedAt`, `sentToKitchenAt` y `preparedAt`. El orden de las ramas
 * importa -- una línea anulada lo está aunque ya se hubiera enviado.
 */
export function orderLineState(line: {
  voidedAt: string | null;
  sentToKitchenAt: string | null;
  preparedAt: string | null;
}): StatusLabel {
  if (line.voidedAt) return { label: 'Anulada', tone: 'danger' };
  if (line.preparedAt) return { label: 'Preparada', tone: 'success' };
  if (line.sentToKitchenAt) return { label: 'En cocina', tone: 'warning' };
  return { label: 'Pendiente', tone: 'neutral' };
}
