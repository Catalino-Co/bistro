import { db, schema } from '@bistro/db';
import { and, eq } from 'drizzle-orm';

export interface UserRoleAssignment {
  roleId: number;
  roleName: string;
  branchId: number;
  branchName: string;
}

export interface UserRow {
  id: number;
  username: string;
  fullName: string;
  status: 'active' | 'inactive';
  createdAt: string;
  roles: UserRoleAssignment[];
}

/**
 * Usuarios con sus asignaciones de rol por sucursal, en dos consultas.
 *
 * El hash de la contraseña nunca sale de aquí: no se selecciona siquiera,
 * para que no pueda acabar en una respuesta por descuido.
 */
export async function listUsers(): Promise<UserRow[]> {
  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
      status: schema.users.status,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users);

  const assignments = await db
    .select({
      userId: schema.userRoles.userId,
      roleId: schema.userRoles.roleId,
      roleName: schema.roles.name,
      branchId: schema.userRoles.branchId,
      branchName: schema.branches.name,
    })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .innerJoin(schema.branches, eq(schema.branches.id, schema.userRoles.branchId));

  const rolesByUser = new Map<number, UserRoleAssignment[]>();
  for (const row of assignments) {
    const existing = rolesByUser.get(row.userId) ?? [];
    existing.push({
      roleId: row.roleId,
      roleName: row.roleName,
      branchId: row.branchId,
      branchName: row.branchName,
    });
    rolesByUser.set(row.userId, existing);
  }

  return users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
    roles: rolesByUser.get(user.id) ?? [],
  }));
}

export async function findUserByUsername(username: string): Promise<{ id: number } | null> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username));
  return row ?? null;
}

export async function findUserById(id: number): Promise<{ id: number; username: string } | null> {
  const [row] = await db
    .select({ id: schema.users.id, username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  return row ?? null;
}

export async function insertUser(
  username: string,
  fullName: string,
  passwordHash: string,
): Promise<{ id: number; username: string; fullName: string }> {
  const [row] = await db
    .insert(schema.users)
    .values({ username, fullName, passwordHash })
    .returning({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
    });
  if (!row) throw new Error('Failed to create user');
  return row;
}

export async function updateUserRow(
  id: number,
  values: {
    fullName?: string | undefined;
    status?: ('active' | 'inactive') | undefined;
    passwordHash?: string | undefined;
  },
): Promise<void> {
  // Se arma el patch solo con lo que viene definido: pasar `undefined`
  // explícito a `.set()` no es lo mismo que omitir la columna, y un patch
  // completamente vacío genera SQL inválido.
  const patch: Partial<typeof schema.users.$inferInsert> = {};
  if (values.fullName !== undefined) patch.fullName = values.fullName;
  if (values.status !== undefined) patch.status = values.status;
  if (values.passwordHash !== undefined) patch.passwordHash = values.passwordHash;
  if (Object.keys(patch).length === 0) return;

  await db.update(schema.users).set(patch).where(eq(schema.users.id, id));
}

export async function userHasRole(
  userId: number,
  roleId: number,
  branchId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: schema.userRoles.userId })
    .from(schema.userRoles)
    .where(
      and(
        eq(schema.userRoles.userId, userId),
        eq(schema.userRoles.roleId, roleId),
        eq(schema.userRoles.branchId, branchId),
      ),
    );
  return row !== undefined;
}

export async function insertUserRole(
  userId: number,
  roleId: number,
  branchId: number,
): Promise<void> {
  await db.insert(schema.userRoles).values({ userId, roleId, branchId }).onConflictDoNothing();
}

export async function deleteUserRole(
  userId: number,
  roleId: number,
  branchId: number,
): Promise<void> {
  await db
    .delete(schema.userRoles)
    .where(
      and(
        eq(schema.userRoles.userId, userId),
        eq(schema.userRoles.roleId, roleId),
        eq(schema.userRoles.branchId, branchId),
      ),
    );
}

export async function roleExists(roleId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(eq(schema.roles.id, roleId));
  return row !== undefined;
}

export async function branchExists(branchId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId));
  return row !== undefined;
}
