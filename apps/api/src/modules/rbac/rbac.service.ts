import { recordAuditEvent } from '../audit/audit.repo.js';
import { deleteRolePermission, insertRolePermission, roleHasPermission } from './rbac.repo.js';

// The service layer B1-2's RBAC UI will call directly -- permission
// changes are exactly the kind of action the legacy left unaudited
// (rest_insert_staff.php/rest_update_staff.php wrote a hardcoded JSON
// blob of permissions per profile with no record of who changed what).
export async function grantPermissionToRole(
  roleId: number,
  permissionId: number,
  actorUserId: number,
): Promise<void> {
  const alreadyGranted = await roleHasPermission(roleId, permissionId);
  if (alreadyGranted) {
    return;
  }

  await insertRolePermission(roleId, permissionId);
  await recordAuditEvent({
    actionKey: 'rbac.permission_granted',
    entityType: 'role',
    entityId: String(roleId),
    beforeData: { granted: false },
    afterData: { granted: true, permissionId },
    userId: actorUserId,
  });
}

export async function revokePermissionFromRole(
  roleId: number,
  permissionId: number,
  actorUserId: number,
): Promise<void> {
  const alreadyGranted = await roleHasPermission(roleId, permissionId);
  if (!alreadyGranted) {
    return;
  }

  await deleteRolePermission(roleId, permissionId);
  await recordAuditEvent({
    actionKey: 'rbac.permission_revoked',
    entityType: 'role',
    entityId: String(roleId),
    beforeData: { granted: true },
    afterData: { granted: false, permissionId },
    userId: actorUserId,
  });
}
