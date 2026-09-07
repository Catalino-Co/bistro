import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

export async function getUserPermissionKeys(userId: number): Promise<Set<string>> {
  const rows = await db
    .select({ key: schema.permissions.key })
    .from(schema.userRoles)
    .innerJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.userRoles.roleId))
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
    .where(eq(schema.userRoles.userId, userId));

  return new Set(rows.map((r) => r.key));
}
