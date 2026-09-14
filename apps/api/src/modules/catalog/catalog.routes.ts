import type { FastifyInstance } from 'fastify';
import {
  archiveItem,
  archiveTreeNode,
  hasArchivedAncestry,
  restoreTreeNode,
  updateTreeNode,
  type TreeLevel,
  createFamily,
  createSubfamily,
  createItem,
  createKitchenStation,
  createCategory,
  listFamilies,
  listSubfamilies,
  listItems,
  listItemsWithFamily,
  listKitchenStations,
  listCategories,
  listTaxRates,
  restoreItem,
  updateItem,
  updateItemStation,
  updateKitchenStationPrinter,
} from './catalog.repo.js';
import {
  subfamilyBodySchema,
  listSubfamiliesQuerySchema,
  listNodesQuerySchema,
  listCategoriesQuerySchema,
  updateNodeBodySchema,
  itemBodySchema,
  itemStationBodySchema,
  kitchenStationBodySchema,
  kitchenStationPrinterBodySchema,
  listItemsQuerySchema,
  nameBodySchema,
  categoryBodySchema,
  updateItemBodySchema,
} from './catalog.schema.js';

const MANAGE_CATALOG = ['catalog.manage'] as const;

// The legacy's menu CRUD covered families/subfamilies/items but never let
// anyone create a category from the UI (rest_insert_category.php never
// sent inc_family/inc_subfamily) -- every level here gets the same CRUD,
// so a category is exactly as easy to create as everything else.
export async function catalogRoutes(app: FastifyInstance) {
  app.get('/catalog/tax-rates', { config: { permissions: [...MANAGE_CATALOG] } }, async () => ({
    taxRates: await listTaxRates(),
  }));

  app.get(
    '/catalog/families',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = listNodesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      return { families: await listFamilies(parsed.data.status) };
    },
  );

  app.post(
    '/catalog/families',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = nameBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      reply.code(201);
      return { family: await createFamily(parsed.data.name) };
    },
  );

  app.get(
    '/catalog/subfamilies',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = listSubfamiliesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      return { subfamilies: await listSubfamilies(parsed.data.familyId, parsed.data.status) };
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
      // Colgar algo nuevo de un padre archivado es crear basura invisible.
      if (await hasArchivedAncestry('family', parsed.data.familyId)) {
        reply.code(409);
        return { error: 'parent_archived' };
      }
      reply.code(201);
      return { subfamily: await createSubfamily(parsed.data.familyId, parsed.data.name) };
    },
  );

  app.get(
    '/catalog/categories',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = listCategoriesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      return { categories: await listCategories(parsed.data.subfamilyId, parsed.data.status) };
    },
  );

  app.post(
    '/catalog/categories',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = categoryBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      if (await hasArchivedAncestry('subfamily', parsed.data.subfamilyId)) {
        reply.code(409);
        return { error: 'parent_archived' };
      }
      reply.code(201);
      return { category: await createCategory(parsed.data.subfamilyId, parsed.data.name) };
    },
  );

  app.get(
    '/catalog/items',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = listItemsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      return { items: await listItems(parsed.data.categoryId, parsed.data.status) };
    },
  );

  // Flat item list with each one's family name joined in, for the POS
  // picker to group by family in a single request.
  app.get('/catalog/items/full', { config: { permissions: [...MANAGE_CATALOG] } }, async () => ({
    items: await listItemsWithFamily(),
  }));

  app.post(
    '/catalog/items',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = itemBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }
      if (await hasArchivedAncestry('category', parsed.data.categoryId)) {
        reply.code(409);
        return { error: 'parent_archived' };
      }
      reply.code(201);
      return {
        item: await createItem(
          parsed.data.categoryId,
          parsed.data.name,
          parsed.data.price,
          parsed.data.taxRateId,
          parsed.data.stationId,
        ),
      };
    },
  );

  // Renombrar, pausar, archivar y restaurar los tres niveles del arbol. Las
  // tres rutas se registran en bucle porque las reglas son identicas: lo unico
  // que cambia es el segmento de la URL y la tabla detras.
  const TREE_ROUTES: { path: string; level: TreeLevel }[] = [
    { path: 'families', level: 'family' },
    { path: 'subfamilies', level: 'subfamily' },
    { path: 'categories', level: 'category' },
  ];

  for (const { path, level } of TREE_ROUTES) {
    app.patch(
      `/catalog/${path}/:id`,
      { config: { permissions: [...MANAGE_CATALOG] } },
      async (request, reply) => {
        const parsed = updateNodeBodySchema.safeParse(request.body);
        if (!parsed.success) {
          reply.code(400);
          return { error: 'invalid_request' };
        }
        const result = await updateTreeNode(
          level,
          Number((request.params as { id: string }).id),
          parsed.data,
          request.session.userId!,
          request.session.branchId,
        );
        switch (result.outcome) {
          case 'not_found':
            reply.code(404);
            return { error: 'not_found' };
          case 'archived':
            reply.code(409);
            return { error: 'node_archived' };
          case 'updated':
            return { node: result.node };
        }
      },
    );

    app.post(
      `/catalog/${path}/:id/archive`,
      { config: { permissions: [...MANAGE_CATALOG] } },
      async (request, reply) => {
        const result = await archiveTreeNode(
          level,
          Number((request.params as { id: string }).id),
          request.session.userId!,
          request.session.branchId,
        );
        switch (result.outcome) {
          case 'not_found':
            reply.code(404);
            return { error: 'not_found' };
          case 'already_archived':
            reply.code(409);
            return { error: 'already_archived' };
          case 'archived':
            return { node: result.node };
        }
      },
    );

    app.post(
      `/catalog/${path}/:id/restore`,
      { config: { permissions: [...MANAGE_CATALOG] } },
      async (request, reply) => {
        const result = await restoreTreeNode(
          level,
          Number((request.params as { id: string }).id),
          request.session.userId!,
          request.session.branchId,
        );
        switch (result.outcome) {
          case 'not_found':
            reply.code(404);
            return { error: 'not_found' };
          case 'not_archived':
            reply.code(409);
            return { error: 'not_archived' };
          case 'restored':
            return { node: result.node };
        }
      },
    );
  }

  // Editar un item. Antes de esto no habia forma de cambiarle el nombre ni el
  // precio: el unico PATCH que existia era el de la estacion.
  app.patch(
    '/catalog/items/:id',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const parsed = updateItemBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      const result = await updateItem(
        Number((request.params as { id: string }).id),
        parsed.data,
        request.session.userId!,
        request.session.branchId,
      );

      switch (result.outcome) {
        case 'item_not_found':
          reply.code(404);
          return { error: 'item_not_found' };
        case 'item_archived':
          reply.code(409);
          return { error: 'item_archived' };
        case 'tax_rate_not_found':
          reply.code(400);
          return { error: 'tax_rate_not_found' };
        case 'updated':
          // 200 con la fila y no 204: el panel de detalle necesita los
          // valores nuevos para repintarse sin volver a pedir la lista.
          return { item: result.item };
      }
    },
  );

  // Archivar en vez de borrar. No hay DELETE de items y no debe haberlo:
  // order_lines.item_id referencia esta fila, asi que borrarla seria borrar
  // historial de ventas.
  app.post(
    '/catalog/items/:id/archive',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const result = await archiveItem(
        Number((request.params as { id: string }).id),
        request.session.userId!,
        request.session.branchId,
      );

      switch (result.outcome) {
        case 'item_not_found':
          reply.code(404);
          return { error: 'item_not_found' };
        case 'already_archived':
          reply.code(409);
          return { error: 'already_archived' };
        case 'archived':
          return { item: result.item };
      }
    },
  );

  app.post(
    '/catalog/items/:id/restore',
    { config: { permissions: [...MANAGE_CATALOG] } },
    async (request, reply) => {
      const result = await restoreItem(
        Number((request.params as { id: string }).id),
        request.session.userId!,
        request.session.branchId,
      );

      switch (result.outcome) {
        case 'item_not_found':
          reply.code(404);
          return { error: 'item_not_found' };
        case 'not_archived':
          reply.code(409);
          return { error: 'not_archived' };
        case 'restored':
          return { item: result.item };
      }
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
      await updateItemStation(Number((request.params as { id: string }).id), parsed.data.stationId);
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
