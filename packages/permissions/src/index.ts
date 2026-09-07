/**
 * Single source of truth for permission keys. Both the Fastify route guard
 * (`config.permissions: [...]`) and the role-assignment UI read from this
 * catalog -- a route can only require a key that's declared here, and the
 * seed script is what actually inserts these into bistro.permissions.
 *
 * Add a new entry here in the same change that adds the route/feature that
 * needs it, not ahead of time -- this list should always match what the app
 * actually enforces.
 */
export const PERMISSIONS = [
  {
    key: 'system.roles.manage',
    description: 'Create/edit roles and assign permissions to them',
  },
  {
    key: 'system.users.manage',
    description: 'Create/edit user accounts and their per-branch role assignments',
  },
  {
    key: 'system.branches.manage',
    description: 'Create/edit companies, business units, and branches',
  },
  {
    key: 'catalog.manage',
    description: 'Create/edit categories, families, subfamilies, and items',
  },
  {
    key: 'floor.manage',
    description: 'Create/edit dine areas and tables for the current branch',
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
