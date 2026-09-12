import type { IconName } from './icons.js';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /**
   * Fase del plan en la que llega la pantalla. Si está presente, la entrada
   * se dibuja pero no navega: preferimos enseñar la estructura completa a
   * esconderla, y preferimos una entrada apagada a un enlace que da 404.
   */
  pending?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// La barra lateral se agrupa por cómo se trabaja, no por cómo está armada
// la base de datos: antes "Mesas y áreas" -- que se configura una vez al
// año -- pesaba lo mismo que "Cocina", que se usa cada minuto. Todo lo que
// se configura una sola vez se fue detrás de Ajustes.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operación',
    items: [
      { href: '/pos', label: 'POS', icon: 'pos', pending: 'Fase 3' },
      { href: '/orders', label: 'Órdenes', icon: 'orders', pending: 'Fase 5' },
      { href: '/kitchen', label: 'Cocina', icon: 'kitchen' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { href: '/menu', label: 'Catálogo', icon: 'catalog' },
      { href: '/customers', label: 'Clientes', icon: 'customer', pending: 'Fase 5' },
    ],
  },
  {
    label: 'General',
    items: [
      { href: '/', label: 'Inicio', icon: 'home' },
      { href: '/settings', label: 'Ajustes', icon: 'settings' },
    ],
  },
];

// Sub-navegación de Ajustes. Las ocho secciones que salieron de la barra
// principal viven aquí dentro; las que aún no existen se marcan igual que
// arriba en vez de desaparecer.
export const SETTINGS_ITEMS: NavItem[] = [
  { href: '/settings/branches', label: 'Sucursales', icon: 'home', pending: 'Fase 4' },
  { href: '/settings/floor', label: 'Áreas y mesas', icon: 'tables' },
  {
    href: '/settings/stations',
    label: 'Estaciones e impresoras',
    icon: 'kitchen',
    pending: 'Fase 2',
  },
  { href: '/settings/payments', label: 'Métodos de pago', icon: 'payment', pending: 'Fase 4' },
  { href: '/settings/taxes', label: 'Impuestos', icon: 'catalog', pending: 'Fase 4' },
  { href: '/settings/users', label: 'Usuarios', icon: 'user', pending: 'Fase 4' },
  { href: '/settings/roles', label: 'Roles y permisos', icon: 'roles' },
  { href: '/settings/audit', label: 'Auditoría', icon: 'lock', pending: 'Fase 4' },
];

/** `/` solo coincide exacto; el resto también con sus rutas hijas. */
export function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
