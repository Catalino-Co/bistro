import type { FastifyInstance } from 'fastify';
import {
  associateModifierGroupWithItem,
  createModifier,
  createModifierGroup,
  disassociateModifierGroupFromItem,
  listModifierGroups,
  listModifierGroupsForItem,
  listModifiers,
} from './modifiers.repo.js';
import {
  itemAssociationBodySchema,
  modifierBodySchema,
  modifierGroupBodySchema,
} from './modifiers.schema.js';

const MANAGE_CATALOG = ['catalog.manage'] as const;

export async function modifiersRoutes(app: FastifyInstance) {
  app.get('/modifiers/groups', { config: { permissions: [...MANAGE_CATALOG] } }, async () => ({
    groups: await listModifierGroups(),
  }));

  app.post(
    '/modifiers/groups',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = modifierGroupBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return { group: await createModifierGroup(parsed.data.name, parsed.data.selectionType) };
    },
  );

  app.get('/modifiers', { config: { permissions: [...MANAGE_CATALOG] } }, async (request) => {
    const { groupId } = request.query as { groupId?: string };
    return { modifiers: await listModifiers(groupId ? Number(groupId) : undefined) };
  });

  app.post(
    '/modifiers',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = modifierBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return {
        modifier: await createModifier(
          parsed.data.groupId,
          parsed.data.name,
          parsed.data.priceDelta,
        ),
      };
    },
  );

  app.get(
    '/catalog/items/:itemId/modifier-groups',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request) => {
      const itemId = Number((request.params as { itemId: string }).itemId);
      return { groups: await listModifierGroupsForItem(itemId) };
    },
  );

  app.post(
    '/catalog/items/modifier-groups',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = itemAssociationBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      await associateModifierGroupWithItem(parsed.data.itemId, parsed.data.modifierGroupId);
      reply.code(204);
      return null;
    },
  );

  app.delete(
    '/catalog/items/:itemId/modifier-groups/:groupId',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const { itemId, groupId } = request.params as { itemId: string; groupId: string };
      await disassociateModifierGroupFromItem(Number(itemId), Number(groupId));
      reply.code(204);
      return null;
    },
  );
}
