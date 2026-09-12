/**
 * Cómo se le presentan los permisos a una persona.
 *
 * `packages/permissions` es el catálogo técnico -- la clave que el guard de
 * la API exige en cada ruta -- y su `description` está en inglés porque es
 * documentación para quien escribe rutas. La pantalla de roles mostraba esa
 * clave cruda (`system.roles.manage`), que no le dice nada a quien
 * administra el restaurante. Esta tabla es la capa de presentación: nombre
 * corto en español, qué habilita, y en qué grupo cae.
 *
 * Si falta una clave, la pantalla cae de vuelta a lo que devuelva la API.
 */
export interface PermissionCopy {
  label: string;
  description: string;
  group: string;
  /** Permiso declarado que todavía no protege ninguna ruta. */
  pending?: string;
}

export const PERMISSION_COPY: Record<string, PermissionCopy> = {
  'system.roles.manage': {
    label: 'Roles y permisos',
    description: 'Crear roles y decidir qué puede hacer cada uno.',
    group: 'Sistema',
  },
  'system.users.manage': {
    label: 'Usuarios',
    description: 'Crear y editar empleados, y asignarles un rol por sucursal.',
    group: 'Sistema',
    pending: 'Fase 4',
  },
  'system.branches.manage': {
    label: 'Sucursales',
    description: 'Crear y editar compañías, unidades de negocio y sucursales.',
    group: 'Sistema',
    pending: 'Fase 4',
  },
  'catalog.manage': {
    label: 'Catálogo',
    description: 'Crear y editar categorías, familias, subfamilias e ítems.',
    group: 'Administración',
  },
  'floor.manage': {
    label: 'Áreas y mesas',
    description: 'Crear y editar las áreas y mesas de la sucursal actual.',
    group: 'Operación',
  },
  'orders.manage': {
    label: 'Órdenes',
    description: 'Abrir y cerrar órdenes en las mesas de la sucursal actual.',
    group: 'Operación',
  },
  'kitchen.manage': {
    label: 'Cocina',
    description: 'Ver las comandas pendientes de una estación y marcarlas preparadas.',
    group: 'Operación',
  },
};

/** Orden en que se muestran los grupos; lo no listado va al final. */
export const PERMISSION_GROUP_ORDER = ['Operación', 'Administración', 'Sistema'];

export function permissionCopy(key: string, fallbackDescription: string | null): PermissionCopy {
  return (
    PERMISSION_COPY[key] ?? {
      label: key,
      description: fallbackDescription ?? '',
      group: 'Otros',
    }
  );
}
