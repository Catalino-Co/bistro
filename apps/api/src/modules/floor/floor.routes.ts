import type { FastifyInstance } from 'fastify';
import {
  createDineArea,
  createDineTable,
  deleteDineArea,
  deleteDineTable,
  listDineAreas,
  listDineTables,
  updateDineArea,
  updateDineTable,
} from './floor.repo.js';
import { dineTableBodySchema, dineTableUpdateBodySchema, nameBodySchema } from './floor.schema.js';

const MANAGE_FLOOR = ['floor.manage'] as const;

// Real CRUD for the legacy's ajuste-mesas.php (read-only, buttons with no
// handler) and the never-implemented ajuste-dine-areas.php.
export async function floorRoutes(app: FastifyInstance) {
  app.get(
    '/floor/dine-areas',
    { config: { permissions: [...MANAGE_FLOOR] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      return { dineAreas: await listDineAreas(branchId) };
    },
  );

  app.post(
    '/floor/dine-areas',
    { config: { permissions: [...MANAGE_FLOOR] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const parsed = nameBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return { dineArea: await createDineArea(branchId, parsed.data.name) };
    },
  );

  app.patch(
    '/floor/dine-areas/:id',
    { config: { permissions: [...MANAGE_FLOOR] } },
    async (request, reply) => {
      const parsed = nameBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      await updateDineArea(Number((request.params as { id: string }).id), parsed.data.name);
      reply.code(204);
      return null;
    },
  );

  app.delete(
    '/floor/dine-areas/:id',
    { config: { permissions: [...MANAGE_FLOOR] } },
    async (request, reply) => {
      await deleteDineArea(Number((request.params as { id: string }).id));
      reply.code(204);
      return null;
    },
  );

  app.get('/floor/tables', { config: { permissions: [...MANAGE_FLOOR] } }, async (request) => {
    const { dineAreaId } = request.query as { dineAreaId: string };
    return { tables: await listDineTables(Number(dineAreaId)) };
  });

  app.post(
    '/floor/tables',
    { config: { permissions: [...MANAGE_FLOOR] } },
    async (request, reply) => {
      const parsed = dineTableBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return {
        table: await createDineTable(parsed.data.dineAreaId, parsed.data.name, parsed.data.seats),
      };
    },
  );

  app.patch(
    '/floor/tables/:id',
    { config: { permissions: [...MANAGE_FLOOR] } },
    async (request, reply) => {
      const parsed = dineTableUpdateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      await updateDineTable(
        Number((request.params as { id: string }).id),
        parsed.data.name,
        parsed.data.seats,
      );
      reply.code(204);
      return null;
    },
  );

  app.delete(
    '/floor/tables/:id',
    { config: { permissions: [...MANAGE_FLOOR] } },
    async (request, reply) => {
      const result = await deleteDineTable(Number((request.params as { id: string }).id));
      if (result.outcome === 'has_orders') {
        reply.code(409);
        return { error: 'table_has_orders' };
      }
      reply.code(204);
      return null;
    },
  );
}
