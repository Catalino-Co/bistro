import type { FastifyInstance } from 'fastify';
import { listStationTickets, markLinePrepared } from './kitchen.repo.js';

const MANAGE_KITCHEN = ['kitchen.manage'] as const;

export async function kitchenRoutes(app: FastifyInstance) {
  app.get(
    '/kitchen/stations/:stationId/tickets',
    { config: { permissions: [...MANAGE_KITCHEN] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const stationId = Number((request.params as { stationId: string }).stationId);
      return { lines: await listStationTickets(branchId, stationId) };
    },
  );

  app.post(
    '/kitchen/lines/:lineId/prepared',
    { config: { permissions: [...MANAGE_KITCHEN] } },
    async (request, reply) => {
      const branchId = request.session.branchId;
      if (typeof branchId !== 'number') {
        reply.code(409);
        return { error: 'no_branch_selected' };
      }
      const lineId = Number((request.params as { lineId: string }).lineId);
      const result = await markLinePrepared(branchId, lineId);
      switch (result.outcome) {
        case 'line_not_found':
          reply.code(404);
          return { error: 'line_not_found' };
        case 'not_sent':
          reply.code(409);
          return { error: 'not_sent' };
        case 'already_prepared':
          reply.code(409);
          return { error: 'already_prepared' };
        case 'prepared':
          reply.code(204);
          return null;
      }
    },
  );
}
