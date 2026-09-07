import { sql } from 'drizzle-orm';
import { db } from '../client';
import { permissions, rolePermissions, roles } from '../schema';

// Seeds a single "admin" role holding every seeded permission. Additional
// roles (manager, cashier, waiter, kitchen, ...) get created through the
// RBAC UI (B1-2) once there are feature permissions worth assigning to
// them -- seeding empty roles ahead of that need would just be noise.
export async function seedAdminRole() {
  const [adminRole] = await db
    .insert(roles)
    .values({ name: 'admin' })
    .onConflictDoUpdate({ target: roles.name, set: { name: sql`excluded.name` } })
    .returning();

  if (!adminRole) {
    throw new Error('Failed to seed admin role');
  }

  const allPermissions = await db.select({ id: permissions.id }).from(permissions);

  if (allPermissions.length === 0) {
    return adminRole;
  }

  await db
    .insert(rolePermissions)
    .values(allPermissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })))
    .onConflictDoNothing();

  return adminRole;
}
