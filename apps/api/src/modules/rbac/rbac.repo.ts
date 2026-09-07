import { db, schema } from '@bistro/db';
import { and, eq } from 'drizzle-orm';

export interface RoleRow {
  id: number;
  name: string;
}

export async function listRoles(): Promise<RoleRow[]> {
  return db.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles);
}

export async function createRole(name: string): Promise<RoleRow> {
  const [row] = await db.insert(schema.roles).values({ name }).returning({
    id: schema.roles.id,
    name: schema.roles.name,
  });
  if (!row) {
    throw new Error('Failed to create role');
  }
  return row;
}

export interface PermissionRow {
  id: number;
  key: string;
  description: string | null;
}

export async function listPermissions(): Promise<PermissionRow[]> {
  return db
    .select({
      id: schema.permissions.id,
      key: schema.permissions.key,
      description: schema.permissions.description,
    })
    .from(schema.permissions);
}

export async function listRolePermissionIds(roleId: number): Promise<number[]> {
  const rows = await db
    .select({ permissionId: schema.rolePermissions.permissionId })
    .from(schema.rolePermissions)
    .where(eq(schema.rolePermissions.roleId, roleId));
  return rows.map((r) => r.permissionId);
}

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
