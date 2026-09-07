import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findAuditEvents } from '../audit/audit.repo.js';
import { closeTestDbPool, createTestUser, deleteTestUser } from '../auth/test-helpers.repo.js';
import { roleHasPermission } from './rbac.repo.js';
import { grantPermissionToRole, revokePermissionFromRole } from './rbac.service.js';
import {
  createTestPermission,
  createTestRole,
  deleteTestPermission,
  deleteTestRole,
} from './rbac.test-helpers.repo.js';

describe('rbac service', () => {
  let roleId: number;
  let permissionId: number;
  let actorUserId: number;

  beforeAll(async () => {
    roleId = await createTestRole('__rbac_test_role__');
    permissionId = await createTestPermission('__rbac_test_permission__');
    actorUserId = await createTestUser('__rbac_test_actor__', 'CorrectHorseBatteryStaple1!');
  });

  afterAll(async () => {
    await deleteTestRole(roleId);
    await deleteTestPermission(permissionId);
    await deleteTestUser('__rbac_test_actor__');
    await closeTestDbPool();
  });

  it('grants a permission and records an audit event', async () => {
    await grantPermissionToRole(roleId, permissionId, actorUserId);

    expect(await roleHasPermission(roleId, permissionId)).toBe(true);

    const events = await findAuditEvents('rbac.permission_granted', String(roleId));
    expect(events.some((e) => e.userId === actorUserId)).toBe(true);
  });

  it('is idempotent: granting an already-granted permission does not duplicate the audit trail', async () => {
    const before = await findAuditEvents('rbac.permission_granted', String(roleId));
    await grantPermissionToRole(roleId, permissionId, actorUserId);
    const after = await findAuditEvents('rbac.permission_granted', String(roleId));

    expect(after.length).toBe(before.length);
  });

  it('revokes a permission and records an audit event', async () => {
    await revokePermissionFromRole(roleId, permissionId, actorUserId);

    expect(await roleHasPermission(roleId, permissionId)).toBe(false);

    const events = await findAuditEvents('rbac.permission_revoked', String(roleId));
    expect(events.some((e) => e.userId === actorUserId)).toBe(true);
  });
});
