import { db, schema } from '@bistro/db';
import { and, desc, eq, gte, ilike, isNull, lt, or, type SQL } from 'drizzle-orm';

export interface AuditEvent {
  actionKey: string;
  entityType?: string | undefined;
  entityId?: string | undefined;
  beforeData?: Record<string, unknown> | undefined;
  afterData?: Record<string, unknown> | undefined;
  userId?: number | undefined;
  branchId?: number | undefined;
  ipAddress?: string | null | undefined;
}

// The single write path for bistro.audit_log -- every caller (guard,
// auth, rbac, and every future module that mutates something sensitive)
// goes through this instead of remembering to INSERT per endpoint, which
// is exactly the discipline the legacy's audit trail lacked (and its one
// real attempt, common.logs_invoices, silently never executed).
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  await db.insert(schema.auditLog).values({
    actionKey: event.actionKey,
    ...(event.entityType !== undefined && { entityType: event.entityType }),
    ...(event.entityId !== undefined && { entityId: event.entityId }),
    ...(event.beforeData !== undefined && { beforeData: event.beforeData }),
    ...(event.afterData !== undefined && { afterData: event.afterData }),
    ...(event.userId !== undefined && { userId: event.userId }),
    ...(event.branchId !== undefined && { branchId: event.branchId }),
    ipAddress: event.ipAddress ?? null,
  });
}

export interface AuditEntry {
  id: number;
  actionKey: string;
  entityType: string | null;
  entityId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  userId: number | null;
  userName: string | null;
  username: string | null;
  branchId: number | null;
  branchName: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Id desde el que continuar; null cuando no queda más. */
  nextCursor: number | null;
}

export interface AuditFilters {
  from?: Date | undefined;
  to?: Date | undefined;
  actionKey?: string | undefined;
  userId?: number | undefined;
  /** Busca en la entidad afectada y en quién lo hizo. */
  search?: string | undefined;
  cursor?: number | undefined;
  limit: number;
}

/**
 * Lee la bitácora. Se escribía desde el primer día del proyecto y no
 * existía ninguna ruta que la leyera: los datos estaban, pero saber quién
 * cambió un permiso exigía entrar a la base.
 *
 * Alcance: los eventos de la sucursal activa más los que no pertenecen a
 * ninguna (un inicio de sesión, un permiso denegado). Esos últimos son del
 * sistema, no de un local, y esconderlos dejaría la bitácora sin la mitad
 * de lo que importa auditar.
 *
 * Paginación por keyset sobre el id descendente, no por OFFSET: la tabla
 * solo crece y un OFFSET grande se vuelve lento justo cuando hay más que
 * revisar.
 */
export async function listAuditEntries(
  branchId: number,
  filters: AuditFilters,
): Promise<AuditPage> {
  const conditions: SQL[] = [
    or(eq(schema.auditLog.branchId, branchId), isNull(schema.auditLog.branchId))!,
  ];
  if (filters.from) conditions.push(gte(schema.auditLog.createdAt, filters.from));
  if (filters.to) conditions.push(lt(schema.auditLog.createdAt, filters.to));
  if (filters.actionKey) conditions.push(eq(schema.auditLog.actionKey, filters.actionKey));
  if (filters.userId !== undefined) conditions.push(eq(schema.auditLog.userId, filters.userId));
  if (filters.cursor !== undefined) conditions.push(lt(schema.auditLog.id, filters.cursor));
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(schema.auditLog.entityId, pattern),
        ilike(schema.auditLog.entityType, pattern),
        ilike(schema.users.fullName, pattern),
        ilike(schema.users.username, pattern),
      )!,
    );
  }

  // Se pide uno de más para saber si hay página siguiente sin contar el
  // total, que en una tabla de bitácora es un escaneo completo.
  const rows = await db
    .select({
      id: schema.auditLog.id,
      actionKey: schema.auditLog.actionKey,
      entityType: schema.auditLog.entityType,
      entityId: schema.auditLog.entityId,
      beforeData: schema.auditLog.beforeData,
      afterData: schema.auditLog.afterData,
      userId: schema.auditLog.userId,
      userName: schema.users.fullName,
      username: schema.users.username,
      branchId: schema.auditLog.branchId,
      branchName: schema.branches.name,
      ipAddress: schema.auditLog.ipAddress,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .leftJoin(schema.branches, eq(schema.branches.id, schema.auditLog.branchId))
    .where(and(...conditions))
    .orderBy(desc(schema.auditLog.id))
    .limit(filters.limit + 1);

  const page = rows.slice(0, filters.limit);
  return {
    entries: page.map((row) => ({
      ...row,
      beforeData: row.beforeData ?? null,
      afterData: row.afterData ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > filters.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Las acciones que realmente aparecen en la bitácora, para el filtro. */
export async function listAuditActionKeys(branchId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ actionKey: schema.auditLog.actionKey })
    .from(schema.auditLog)
    .where(or(eq(schema.auditLog.branchId, branchId), isNull(schema.auditLog.branchId)))
    .orderBy(schema.auditLog.actionKey);
  return rows.map((row) => row.actionKey);
}

export interface AuditLogRow {
  id: number;
  actionKey: string;
  entityType: string | null;
  entityId: string | null;
  userId: number | null;
}

export async function findAuditEvents(
  actionKey: string,
  entityId?: string,
): Promise<AuditLogRow[]> {
  return db
    .select({
      id: schema.auditLog.id,
      actionKey: schema.auditLog.actionKey,
      entityType: schema.auditLog.entityType,
      entityId: schema.auditLog.entityId,
      userId: schema.auditLog.userId,
    })
    .from(schema.auditLog)
    .where(
      entityId !== undefined
        ? and(eq(schema.auditLog.actionKey, actionKey), eq(schema.auditLog.entityId, entityId))
        : eq(schema.auditLog.actionKey, actionKey),
    );
}
