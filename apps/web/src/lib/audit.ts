import type { BadgeTone } from './components/Badge.svelte';

/**
 * Cómo se lee la bitácora.
 *
 * `action_key` es un contrato entre módulos (`rbac.permission_granted`),
 * no algo que se le pueda enseñar a quien administra el restaurante. Aquí
 * cada clave se traduce y, más importante, se marca cuáles son sensibles:
 * quién tocó un permiso o una contraseña es justo lo que uno viene a
 * buscar cuando abre una bitácora, y no debería tener el mismo peso visual
 * que un inicio de sesión rutinario.
 */
export interface AuditActionCopy {
  label: string;
  tone: BadgeTone;
}

export const AUDIT_ACTIONS: Record<string, AuditActionCopy> = {
  'auth.login': { label: 'Inicio de sesión', tone: 'neutral' },
  'auth.logout': { label: 'Cierre de sesión', tone: 'neutral' },
  'auth.login_failed': { label: 'Intento de acceso fallido', tone: 'warning' },
  'auth.login_locked': { label: 'Cuenta bloqueada por intentos', tone: 'danger' },
  'guard.denied': { label: 'Acceso denegado', tone: 'warning' },

  'branch.selected': { label: 'Cambio de sucursal', tone: 'neutral' },

  'order_line.updated': { label: 'Línea de orden modificada', tone: 'neutral' },
  'order_line.voided': { label: 'Línea de orden anulada', tone: 'warning' },

  'users.created': { label: 'Empleado creado', tone: 'primary' },
  'users.updated': { label: 'Empleado modificado', tone: 'neutral' },
  'users.password_reset': { label: 'Contraseña cambiada', tone: 'warning' },
  'users.role_assigned': { label: 'Rol asignado a un empleado', tone: 'warning' },
  'users.role_revoked': { label: 'Rol retirado a un empleado', tone: 'warning' },

  'rbac.role_created': { label: 'Rol creado', tone: 'primary' },
  'rbac.permission_granted': { label: 'Permiso concedido a un rol', tone: 'warning' },
  'rbac.permission_revoked': { label: 'Permiso retirado de un rol', tone: 'warning' },

  'catalog.item_updated': { label: 'Ítem editado', tone: 'neutral' },
  'catalog.item_archived': { label: 'Ítem archivado', tone: 'warning' },
  'catalog.item_restored': { label: 'Ítem restaurado', tone: 'primary' },

  'catalog.family_updated': { label: 'Familia editada', tone: 'neutral' },
  'catalog.family_archived': { label: 'Familia archivada', tone: 'warning' },
  'catalog.family_restored': { label: 'Familia restaurada', tone: 'primary' },
  'catalog.subfamily_updated': { label: 'Subfamilia editada', tone: 'neutral' },
  'catalog.subfamily_archived': { label: 'Subfamilia archivada', tone: 'warning' },
  'catalog.subfamily_restored': { label: 'Subfamilia restaurada', tone: 'primary' },
  'catalog.category_updated': { label: 'Categoría editada', tone: 'neutral' },
  'catalog.category_archived': { label: 'Categoría archivada', tone: 'warning' },
  'catalog.category_restored': { label: 'Categoría restaurada', tone: 'primary' },

  'order.bill_printed': { label: 'Cuenta impresa', tone: 'neutral' },

  'customers.updated': { label: 'Cliente modificado', tone: 'neutral' },
  'customers.archived': { label: 'Cliente archivado', tone: 'warning' },
  'customers.restored': { label: 'Cliente restaurado', tone: 'primary' },

  'org.company_created': { label: 'Compañía creada', tone: 'primary' },
  'org.business_unit_created': { label: 'Unidad de negocio creada', tone: 'primary' },
  'org.branch_created': { label: 'Sucursal creada', tone: 'primary' },
  'org.branch_updated': { label: 'Sucursal modificada', tone: 'primary' },
};

/** Una clave desconocida se muestra tal cual en vez de desaparecer. */
export function auditAction(actionKey: string): AuditActionCopy {
  return AUDIT_ACTIONS[actionKey] ?? { label: actionKey, tone: 'neutral' };
}

const ENTITY_TYPES: Record<string, string> = {
  role: 'Rol',
  user: 'Empleado',
  company: 'Compañía',
  business_unit: 'Unidad de negocio',
  branch: 'Sucursal',
  order_line: 'Línea de orden',
  item: 'Ítem',
  family: 'Familia',
  subfamily: 'Subfamilia',
  category: 'Categoría',
  customer: 'Cliente',
  order: 'Orden',
  permission: 'Permiso',
};

export function entityLabel(entityType: string | null): string | null {
  if (!entityType) return null;
  return ENTITY_TYPES[entityType] ?? entityType;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  price: 'Precio',
  taxRateId: 'Impuesto',
  phone: 'Teléfono',
  taxId: 'RNC',
  customerTypeId: 'Tipo de cliente',
  archivedAt: 'Archivado el',
  fullName: 'Nombre completo',
  username: 'Usuario',
  status: 'Estado',
  granted: 'Concedido',
  permissionId: 'Permiso',
  roleId: 'Rol',
  branchId: 'Sucursal',
  companyId: 'Compañía',
  businessUnitId: 'Unidad de negocio',
  timezone: 'Zona horaria',
  quantity: 'Cantidad',
  note: 'Nota',
  reason: 'Motivo',
  reprintNumber: 'Reimpresión número',
  total: 'Total',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
