import argon2 from 'argon2';
import { recordAuditEvent } from '../audit/audit.repo.js';
import {
  branchExists,
  deleteUserRole,
  findUserById,
  findUserByUsername,
  insertUser,
  insertUserRole,
  roleExists,
  updateUserRow,
  userHasRole,
} from './users.repo.js';

export type CreateUserResult =
  | { outcome: 'created'; user: { id: number; username: string; fullName: string } }
  | { outcome: 'username_taken' };

export type AssignRoleResult =
  | { outcome: 'assigned' }
  | { outcome: 'already_assigned' }
  | { outcome: 'user_not_found' }
  | { outcome: 'role_not_found' }
  | { outcome: 'branch_not_found' };

export type UpdateUserResult = { outcome: 'updated' } | { outcome: 'user_not_found' };

/**
 * Alta de un empleado. Hasta ahora la única forma de crear un usuario era
 * el script `dev:create-user`, es decir, entrar al servidor -- y no había
 * forma de asignarle un rol desde ningún sitio.
 *
 * Un usuario recién creado no puede hacer nada todavía: los permisos viven
 * en los roles, y un rol se asigna por sucursal (`user_roles`). Eso es
 * deliberado, no un paso olvidado.
 */
export async function createUser(
  username: string,
  fullName: string,
  password: string,
  actorUserId: number,
): Promise<CreateUserResult> {
  const existing = await findUserByUsername(username);
  if (existing) {
    return { outcome: 'username_taken' };
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await insertUser(username, fullName, passwordHash);

  await recordAuditEvent({
    actionKey: 'users.created',
    entityType: 'user',
    entityId: String(user.id),
    // Nunca la contraseña ni su hash: la bitácora se lee, se exporta y se
    // conserva mucho más tiempo que una sesión.
    afterData: { username, fullName },
    userId: actorUserId,
  });

  return { outcome: 'created', user };
}

export async function updateUser(
  userId: number,
  values: { fullName?: string | undefined; status?: ('active' | 'inactive') | undefined },
  actorUserId: number,
): Promise<UpdateUserResult> {
  const user = await findUserById(userId);
  if (!user) {
    return { outcome: 'user_not_found' };
  }

  await updateUserRow(userId, values);
  await recordAuditEvent({
    actionKey: 'users.updated',
    entityType: 'user',
    entityId: String(userId),
    afterData: values,
    userId: actorUserId,
  });
  return { outcome: 'updated' };
}

export async function resetUserPassword(
  userId: number,
  password: string,
  actorUserId: number,
): Promise<UpdateUserResult> {
  const user = await findUserById(userId);
  if (!user) {
    return { outcome: 'user_not_found' };
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await updateUserRow(userId, { passwordHash });
  await recordAuditEvent({
    actionKey: 'users.password_reset',
    entityType: 'user',
    entityId: String(userId),
    // Que hubo un cambio de contraseña es exactamente lo que hay que poder
    // auditar; qué contraseña, jamás.
    afterData: { username: user.username },
    userId: actorUserId,
  });
  return { outcome: 'updated' };
}

export async function assignRole(
  userId: number,
  roleId: number,
  branchId: number,
  actorUserId: number,
): Promise<AssignRoleResult> {
  if (!(await findUserById(userId))) return { outcome: 'user_not_found' };
  if (!(await roleExists(roleId))) return { outcome: 'role_not_found' };
  if (!(await branchExists(branchId))) return { outcome: 'branch_not_found' };
  if (await userHasRole(userId, roleId, branchId)) return { outcome: 'already_assigned' };

  await insertUserRole(userId, roleId, branchId);
  await recordAuditEvent({
    actionKey: 'users.role_assigned',
    entityType: 'user',
    entityId: String(userId),
    afterData: { roleId, branchId },
    userId: actorUserId,
  });
  return { outcome: 'assigned' };
}

export async function revokeRole(
  userId: number,
  roleId: number,
  branchId: number,
  actorUserId: number,
): Promise<void> {
  if (!(await userHasRole(userId, roleId, branchId))) {
    return;
  }

  await deleteUserRole(userId, roleId, branchId);
  await recordAuditEvent({
    actionKey: 'users.role_revoked',
    entityType: 'user',
    entityId: String(userId),
    beforeData: { roleId, branchId },
    userId: actorUserId,
  });
}
