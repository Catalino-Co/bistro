import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordAuditEvent } from '../audit/audit.repo.js';
import {
  businessUnitExists,
  companyExists,
  findBranchRow,
  insertBranch,
  insertBusinessUnit,
  insertCompany,
  listBranches,
  listBusinessUnits,
  listCompanies,
  updateBranchRow,
} from './org.repo.js';

const MANAGE_ORG = ['system.branches.manage'] as const;

const companyBodySchema = z.object({
  name: z.string().min(1).max(255),
  taxId: z.string().min(1).max(50).optional(),
});

const businessUnitBodySchema = z.object({
  companyId: z.number().int().positive(),
  name: z.string().min(1).max(255),
});

const branchBodySchema = z.object({
  businessUnitId: z.number().int().positive(),
  name: z.string().min(1).max(255),
  timezone: z.string().min(1).max(64).optional(),
});

const updateBranchBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    timezone: z.string().min(1).max(64).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    // null quita la impresora de caja y deja la sucursal cobrando sin
    // imprimir, que es una configuración válida.
    receiptPrinterHost: z.string().min(1).max(255).nullable().optional(),
    receiptPrinterPort: z.number().int().min(1).max(65535).nullable().optional(),
  })
  .refine(
    (body) =>
      (body.receiptPrinterHost === undefined) === (body.receiptPrinterPort === undefined) &&
      (body.receiptPrinterHost === null) === (body.receiptPrinterPort === null),
    { message: 'la impresora necesita dirección y puerto, o ninguno de los dos' },
  )
  .refine((body) => Object.keys(body).length > 0, { message: 'nada que actualizar' });

/**
 * Compañías, unidades de negocio y sucursales. El otro permiso huérfano,
 * `system.branches.manage`, por fin protege algo.
 *
 * No hay DELETE a propósito. Una sucursal está referenciada por usuarios,
 * órdenes, mesas y la bitácora; borrarla es o imposible por FK o una forma
 * de perder historial fiscal. Se da de baja con status inactive.
 */
export async function orgRoutes(app: FastifyInstance) {
  app.get('/org/companies', { config: { permissions: [...MANAGE_ORG] } }, async () => ({
    companies: await listCompanies(),
  }));

  app.post(
    '/org/companies',
    { config: { permissions: [...MANAGE_ORG] } },
    async (request, reply) => {
      const parsed = companyBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      const company = await insertCompany(parsed.data.name, parsed.data.taxId ?? null);
      await recordAuditEvent({
        actionKey: 'org.company_created',
        entityType: 'company',
        entityId: String(company.id),
        afterData: { name: company.name },
        userId: request.session.userId!,
      });
      reply.code(201);
      return { company };
    },
  );

  app.get('/org/business-units', { config: { permissions: [...MANAGE_ORG] } }, async (request) => {
    const { companyId } = request.query as { companyId?: string };
    return { businessUnits: await listBusinessUnits(companyId ? Number(companyId) : undefined) };
  });

  app.post(
    '/org/business-units',
    { config: { permissions: [...MANAGE_ORG] } },
    async (request, reply) => {
      const parsed = businessUnitBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      if (!(await companyExists(parsed.data.companyId))) {
        reply.code(404);
        return { error: 'company_not_found' };
      }
      const businessUnit = await insertBusinessUnit(parsed.data.companyId, parsed.data.name);
      await recordAuditEvent({
        actionKey: 'org.business_unit_created',
        entityType: 'business_unit',
        entityId: String(businessUnit.id),
        afterData: { name: businessUnit.name, companyId: businessUnit.companyId },
        userId: request.session.userId!,
      });
      reply.code(201);
      return { businessUnit };
    },
  );

  // Leer la lista de sucursales también lo necesita quien administra
  // usuarios: un rol se asigna por sucursal, así que la pantalla de
  // Usuarios tiene que poder ofrecerlas. El guard exige *alguno* de los
  // permisos listados, no todos, y esto sigue sin dar acceso de escritura.
  app.get(
    '/org/branches',
    { config: { permissions: [...MANAGE_ORG, 'system.users.manage'] } },
    async (request) => {
      const { businessUnitId } = request.query as { businessUnitId?: string };
      return { branches: await listBranches(businessUnitId ? Number(businessUnitId) : undefined) };
    },
  );

  app.post(
    '/org/branches',
    { config: { permissions: [...MANAGE_ORG] } },
    async (request, reply) => {
      const parsed = branchBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      if (!(await businessUnitExists(parsed.data.businessUnitId))) {
        reply.code(404);
        return { error: 'business_unit_not_found' };
      }
      const branch = await insertBranch(
        parsed.data.businessUnitId,
        parsed.data.name,
        parsed.data.timezone ?? 'America/Santo_Domingo',
      );
      await recordAuditEvent({
        actionKey: 'org.branch_created',
        entityType: 'branch',
        entityId: String(branch.id),
        afterData: { name: branch.name, businessUnitId: branch.businessUnitId },
        userId: request.session.userId!,
      });
      reply.code(201);
      return { branch };
    },
  );

  app.patch(
    '/org/branches/:id',
    { config: { permissions: [...MANAGE_ORG] } },
    async (request, reply) => {
      const parsed = updateBranchBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      const id = Number((request.params as { id: string }).id);
      const before = await findBranchRow(id);
      if (!before) {
        reply.code(404);
        return { error: 'branch_not_found' };
      }

      await updateBranchRow(id, parsed.data);
      await recordAuditEvent({
        actionKey: 'org.branch_updated',
        entityType: 'branch',
        entityId: String(id),
        beforeData: {
          name: before.name,
          timezone: before.timezone,
          status: before.status,
          receiptPrinterHost: before.receiptPrinterHost,
        },
        afterData: parsed.data,
        userId: request.session.userId!,
      });
      reply.code(204);
      return null;
    },
  );
}
