import { db, schema } from '@bistro/db';
import { and, eq } from 'drizzle-orm';

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
