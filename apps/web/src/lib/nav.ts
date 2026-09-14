import type { CardNavItem } from './components/CardNav.svelte';
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
      { href: '/pos', label: 'POS', icon: 'pos' },
      { href: '/orders', label: 'Órdenes', icon: 'orders' },
      { href: '/kitchen', label: 'Cocina', icon: 'kitchen' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { href: '/menu', label: 'Catálogo', icon: 'catalog' },
      { href: '/customers', label: 'Clientes', icon: 'customer' },
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

// Las ocho secciones de Ajustes: todo lo que se configura una vez y no se
// vuelve a tocar. Se dibujan como tarjetas, igual que el Catálogo -- ver
// `docs/ui-standards.md`. Las que aún no existen se marcan en vez de
// desaparecer: preferimos enseñar la estructura completa a esconderla.
//
// «Sucursal activa» va primero porque es la única que usa todo el mundo y
// a diario -- las demás se tocan al montar el local. El resto va en el
// orden de ese montaje: primero dónde se vende, luego cómo sale la comida,
// luego con qué se cobra, luego quién entra, y al final el registro de lo
// que se hizo.
export const SETTINGS_ITEMS: CardNavItem[] = [
  {
    href: '/settings/branch',
    label: 'Sucursal activa',
    description: 'En qué local estás trabajando ahora mismo',
    icon: 'switch',
  },
  {
    href: '/settings/branches',
    label: 'Sucursales',
    description: 'Los locales, su zona horaria y su impresora de caja',
    icon: 'home',
  },
  {
    href: '/settings/floor',
    label: 'Áreas y mesas',
    description: 'Cómo se divide el salón y cuántos puestos tiene cada mesa',
    icon: 'tables',
  },
  {
    href: '/settings/stations',
    label: 'Estaciones e impresoras',
    description: 'A qué cocina y a qué impresora sale cada comanda',
    icon: 'kitchen',
  },
  {
    href: '/settings/payments',
    label: 'Métodos de pago',
    description: 'Con qué se puede cobrar una orden',
    icon: 'payment',
    pending: 'Fase 4',
  },
  {
    href: '/settings/taxes',
    label: 'Impuestos',
    description: 'Las tasas que se aplican al precio de un ítem',
    icon: 'catalog',
    pending: 'Fase 4',
  },
  {
    href: '/settings/users',
    label: 'Usuarios',
    description: 'Quién entra al sistema y con qué rol en cada sucursal',
    icon: 'user',
  },
  {
    href: '/settings/roles',
    label: 'Roles y permisos',
    description: 'Qué puede hacer cada rol dentro de la app',
    icon: 'roles',
  },
  {
    href: '/settings/audit',
    label: 'Auditoría',
    description: 'Quién hizo qué, cuándo y desde dónde',
    icon: 'lock',
  },
];

// Las secciones del Catálogo, en el orden del árbol: una categoría contiene
// familias, una familia contiene subfamilias, y los ítems cuelgan de la
// subfamilia. Los modificadores van al final porque son transversales --
// se asocian a un ítem, no cuelgan de él.
//
// Se dibujan como tarjetas, no como pestañas: ver `docs/ui-standards.md`.
export const CATALOG_ITEMS: CardNavItem[] = [
  {
    href: '/menu/categories',
    label: 'Categorías',
    description: 'El primer nivel del menú: Comidas, Bebidas…',
    icon: 'folder',
  },
  {
    href: '/menu/families',
    label: 'Familias',
    description: 'El segundo nivel, dentro de cada categoría',
    icon: 'layers',
  },
  {
    href: '/menu/subfamilies',
    label: 'Subfamilias',
    description: 'El tercer nivel, del que cuelgan los ítems',
    icon: 'branch',
  },
  {
    href: '/menu/items',
    label: 'Ítems',
    description: 'Lo que se vende: precio, impuesto, estación y modificadores',
    icon: 'plate',
  },
  {
    href: '/menu/modifiers',
    label: 'Modificadores',
    description: 'Grupos y opciones que se asocian a un ítem',
    icon: 'modifiers',
  },
];

/** `/` solo coincide exacto; el resto también con sus rutas hijas. */
export function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
