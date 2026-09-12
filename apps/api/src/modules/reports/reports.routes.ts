import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDailySummary } from './reports.repo.js';

const VIEW_REPORTS = ['reports.view'] as const;

// `from`/`to` llegan como instantes ISO calculados por el cliente, que es
// quien sabe dónde empieza "hoy" para quien mira la pantalla.
const dailyQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

/**
 * Reportes. Permiso propio y no `orders.manage`: abrir y cobrar una mesa
 * es el trabajo de un mesero; ver cuánto vendió el local hoy, no.
 */
export async function reportsRoutes(app: FastifyInstance) {
  app.get(
    '/reports/daily',
    { config: { permissions: [...VIEW_REPORTS] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const parsed = dailyQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      return getDailySummary(branchId, new Date(parsed.data.from), new Date(parsed.data.to));
    },
  );
}
