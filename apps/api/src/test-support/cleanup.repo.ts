import { db, schema } from '@bistro/db';
import { inArray, like, or, type SQL } from 'drizzle-orm';

// All test fixtures across every suite name themselves "__something__" (see
// createTestUser, createBranchFixture, createTestRole, etc.). Rather than
// have every test file remember its own FK-safe cleanup order (auth,
// guard, rbac and audit tests each hit this independently -- see the
// session's own history of FK-violation failures), this sweeps every
// table by that one convention, in the order their foreign keys require.
//
// This isn't per-run database isolation (that's Testcontainers, deferred
// for now -- see B0-13 in the plan), just a single source of truth for
// "delete everything test fixtures created" so a suite can call it in
// both beforeAll (in case a previous run crashed mid-cleanup) and
// afterAll.
const TEST_PATTERN = '\\_\\_%';
// entity_id also holds route paths for guard.denied events (e.g.
// "/__test/no-config__") and bare numeric ids for rbac events (e.g. a
// role's id, which never contains "__" itself) -- those numeric ones are
// caught below via the actual test role/permission ids instead of a
// pattern match.
const TEST_PATTERN_ANYWHERE = '%\\_\\_%';

async function idsWhere(query: Promise<{ id: number }[]>): Promise<number[]> {
  const rows = await query;
  return rows.map((r) => r.id);
}

// drizzle's inArray([], ...) generates invalid SQL, and or() with every
// branch undefined returns undefined -- which .where(undefined) treats as
// "no filter", deleting the *entire* table. orMaybe returns undefined only
// when there is truly nothing to filter by, and the caller below always
// skips the delete in that case instead of ever running it unconditionally.
function orMaybe(...conditions: (SQL | undefined)[]): SQL | undefined {
  const defined = conditions.filter((c): c is SQL => c !== undefined);
  return defined.length > 0 ? or(...defined) : undefined;
}

async function deleteWhereAny(
  table: Parameters<typeof db.delete>[0],
  condition: SQL | undefined,
): Promise<void> {
  if (!condition) {
    return;
  }
  await db.delete(table).where(condition);
}

export async function sweepTestData(): Promise<void> {
  const userIds = await idsWhere(
    db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(like(schema.users.username, TEST_PATTERN)),
  );
  const roleIds = await idsWhere(
    db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(like(schema.roles.name, TEST_PATTERN)),
  );
  const permissionIds = await idsWhere(
    db
      .select({ id: schema.permissions.id })
      .from(schema.permissions)
      .where(like(schema.permissions.key, TEST_PATTERN)),
  );
  const branchIds = await idsWhere(
    db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(like(schema.branches.name, TEST_PATTERN)),
  );

  const auditEntityIds = [...roleIds, ...permissionIds, ...branchIds, ...userIds].map(String);

  await deleteWhereAny(
    schema.sessions,
    orMaybe(
      userIds.length > 0 ? inArray(schema.sessions.userId, userIds) : undefined,
      branchIds.length > 0 ? inArray(schema.sessions.branchId, branchIds) : undefined,
    ),
  );

  // Always has at least the entityId LIKE condition, so this one is safe
  // to run via the normal (non-guarded) delete.
  await db
    .delete(schema.auditLog)
    .where(
      or(
        userIds.length > 0 ? inArray(schema.auditLog.userId, userIds) : undefined,
        branchIds.length > 0 ? inArray(schema.auditLog.branchId, branchIds) : undefined,
        like(schema.auditLog.entityId, TEST_PATTERN_ANYWHERE),
        auditEntityIds.length > 0 ? inArray(schema.auditLog.entityId, auditEntityIds) : undefined,
      ),
    );

  await db.delete(schema.loginAttempts).where(like(schema.loginAttempts.username, TEST_PATTERN));

  await deleteWhereAny(
    schema.userRoles,
    orMaybe(
      userIds.length > 0 ? inArray(schema.userRoles.userId, userIds) : undefined,
      roleIds.length > 0 ? inArray(schema.userRoles.roleId, roleIds) : undefined,
      branchIds.length > 0 ? inArray(schema.userRoles.branchId, branchIds) : undefined,
    ),
  );

  await deleteWhereAny(
    schema.rolePermissions,
    orMaybe(
      roleIds.length > 0 ? inArray(schema.rolePermissions.roleId, roleIds) : undefined,
      permissionIds.length > 0
        ? inArray(schema.rolePermissions.permissionId, permissionIds)
        : undefined,
    ),
  );

  // Salón y órdenes de las sucursales de prueba. Cada suite ya limpia lo
  // suyo en su afterAll (deleteBranchFixture), pero si ese afterAll revienta
  // a mitad -- y revienta, en cuanto alguien se equivoca de orden -- la
  // sucursal se queda con áreas colgando y el delete de branches de abajo
  // choca contra la FK. Eso deja la base bloqueada para TODAS las corridas
  // siguientes, incluida la que vendría a arreglarlo. Aquí se despeja el
  // camino, que es justo lo que este sweep promete en su comentario de
  // cabecera. Todo por id: nada de patrones con comodín.
  if (branchIds.length > 0) {
    const orderIds = await idsWhere(
      db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(inArray(schema.orders.branchId, branchIds)),
    );
    if (orderIds.length > 0) {
      await db.delete(schema.payments).where(inArray(schema.payments.orderId, orderIds));
      const lineIds = await idsWhere(
        db
          .select({ id: schema.orderLines.id })
          .from(schema.orderLines)
          .where(inArray(schema.orderLines.orderId, orderIds)),
      );
      if (lineIds.length > 0) {
        await db
          .delete(schema.orderLineModifiers)
          .where(inArray(schema.orderLineModifiers.orderLineId, lineIds));
        await db.delete(schema.orderLines).where(inArray(schema.orderLines.id, lineIds));
      }
      await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
    }

    const areaIds = await idsWhere(
      db
        .select({ id: schema.dineAreas.id })
        .from(schema.dineAreas)
        .where(inArray(schema.dineAreas.branchId, branchIds)),
    );
    if (areaIds.length > 0) {
      await db.delete(schema.dineTables).where(inArray(schema.dineTables.dineAreaId, areaIds));
      await db.delete(schema.dineAreas).where(inArray(schema.dineAreas.id, areaIds));
    }
  }

  await db.delete(schema.users).where(like(schema.users.username, TEST_PATTERN));
  await db.delete(schema.branches).where(like(schema.branches.name, TEST_PATTERN));
  await db.delete(schema.businessUnits).where(like(schema.businessUnits.name, TEST_PATTERN));
  await db.delete(schema.companies).where(like(schema.companies.name, TEST_PATTERN));
  await db.delete(schema.roles).where(like(schema.roles.name, TEST_PATTERN));
  await db.delete(schema.permissions).where(like(schema.permissions.key, TEST_PATTERN));
}
