import type { FastifyInstance } from 'fastify';
import {
  createCategory,
  createFamily,
  createItem,
  createKitchenStation,
  createSubfamily,
  listCategories,
  listFamilies,
  listItems,
  listItemsWithCategory,
  listKitchenStations,
  listSubfamilies,
  listTaxRates,
  updateItemStation,
  updateKitchenStationPrinter,
} from './catalog.repo.js';
import {
  familyBodySchema,
  itemBodySchema,
  itemStationBodySchema,
  kitchenStationBodySchema,
  kitchenStationPrinterBodySchema,
  nameBodySchema,
  subfamilyBodySchema,
} from './catalog.schema.js';

const MANAGE_CATALOG = ['catalog.manage'] as const;

// The legacy's menu CRUD covered categories/families/items but never let
// anyone create a subfamily from the UI (rest_insert_category.php never
// sent inc_family/inc_subfamily) -- every level here gets the same CRUD,
// so a subfamily is exactly as easy to create as everything else.
export async function catalogRoutes(app: FastifyInstance) {
  app.get('/catalog/tax-rates', { config: { permissions: [...MANAGE_CATALOG] } }, async () => ({
    taxRates: await listTaxRates(),
  }));

  app.get('/catalog/categories', { config: { permissions: [...MANAGE_CATALOG] } }, async () => ({
    categories: await listCategories(),
  }));

  app.post(
    '/catalog/categories',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = nameBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return { category: await createCategory(parsed.data.name) };
    },
  );

  app.get(
    '/catalog/families',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request) => {
      const { categoryId } = request.query as { categoryId?: string };
      return { families: await listFamilies(categoryId ? Number(categoryId) : undefined) };
    },
  );

  app.post(
    '/catalog/families',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = familyBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return { family: await createFamily(parsed.data.categoryId, parsed.data.name) };
    },
  );

  app.get(
    '/catalog/subfamilies',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request) => {
      const { familyId } = request.query as { familyId?: string };
      return { subfamilies: await listSubfamilies(familyId ? Number(familyId) : undefined) };
    },
  );

  app.post(
    '/catalog/subfamilies',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = subfamilyBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return { subfamily: await createSubfamily(parsed.data.familyId, parsed.data.name) };
    },
  );

  app.get('/catalog/items', { config: { permissions: [...MANAGE_CATALOG] } }, async (request) => {
    const { subfamilyId } = request.query as { subfamilyId?: string };
    return { items: await listItems(subfamilyId ? Number(subfamilyId) : undefined) };
  });

  // Flat item list with each one's category name joined in, for the POS
  // picker to group by category in a single request.
  app.get(
    '/catalog/items/full',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async () => ({ items: await listItemsWithCategory() }),
  );

  app.post(
    '/catalog/items',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = itemBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return {
        item: await createItem(
          parsed.data.subfamilyId,
          parsed.data.name,
          parsed.data.price,
          parsed.data.taxRateId,
          parsed.data.stationId,
        ),
      };
    },
  );

  app.patch(
    '/catalog/items/:id/station',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = itemStationBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      await updateItemStation(
        Number((request.params as { id: string }).id),
        parsed.data.stationId,
      );
      reply.code(204);
      return null;
    },
  );

  app.get(
    '/catalog/kitchen-stations',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async () => ({ kitchenStations: await listKitchenStations() }),
  );

  app.post(
    '/catalog/kitchen-stations',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = kitchenStationBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return {
        kitchenStation: await createKitchenStation(
          parsed.data.name,
          parsed.data.printerHost,
          parsed.data.printerPort,
        ),
      };
    },
  );

  app.patch(
    '/catalog/kitchen-stations/:id/printer',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = kitchenStationPrinterBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      await updateKitchenStationPrinter(
        Number((request.params as { id: string }).id),
        parsed.data.printerHost,
        parsed.data.printerPort,
      );
      reply.code(204);
      return null;
    },
  );
}
