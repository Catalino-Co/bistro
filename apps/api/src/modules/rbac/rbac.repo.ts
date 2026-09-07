import { db, schema } from '@bistro/db';
import { and, eq } from 'drizzle-orm';

export async function roleHasPermission(roleId: number, permissionId: number): Promise<boolean> {
  const [row] = await db
    .select({ roleId: schema.rolePermissions.roleId })
    .from(schema.rolePermissions)
    .where(
      and(
        eq(schema.rolePermissions.roleId, roleId),
        eq(schema.rolePermissions.permissionId, permissionId),
      ),
    );
  return row !== undefined;
}

export async function insertRolePermission(roleId: number, permissionId: number): Promise<void> {
  await db.insert(schema.rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
}

export async function deleteRolePermission(roleId: number, permissionId: number): Promise<void> {
  await db
    .delete(schema.rolePermissions)
    .where(
      and(
        eq(schema.rolePermissions.roleId, roleId),
        eq(schema.rolePermissions.permissionId, permissionId),
      ),
    );
}
