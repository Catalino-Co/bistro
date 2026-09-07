import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

export async function createTestRole(name: string): Promise<number> {
  const [row] = await db.insert(schema.roles).values({ name }).returning({ id: schema.roles.id });
  if (!row) {
    throw new Error('Failed to create test role');
  }
  return row.id;
}

export async function createTestPermission(key: string): Promise<number> {
  const [row] = await db
    .insert(schema.permissions)
    .values({ key, description: 'test permission' })
    .returning({ id: schema.permissions.id });
  if (!row) {
    throw new Error('Failed to create test permission');
  }
  return row.id;
}

export async function deleteTestRole(roleId: number): Promise<void> {
  await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId));
  await db.delete(schema.roles).where(eq(schema.roles.id, roleId));
}

export async function deleteTestPermission(permissionId: number): Promise<void> {
  await db
    .delete(schema.rolePermissions)
    .where(eq(schema.rolePermissions.permissionId, permissionId));
  await db.delete(schema.permissions).where(eq(schema.permissions.id, permissionId));
}
