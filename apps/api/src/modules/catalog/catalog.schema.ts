import { z } from 'zod';

export const nameBodySchema = z.object({
  name: z.string().min(1).max(200),
});

export const familyBodySchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

export const subfamilyBodySchema = z.object({
  familyId: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

export const itemBodySchema = z.object({
  subfamilyId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  price: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Expected a decimal string'),
  taxRateId: z.number().int().positive(),
  stationId: z.number().int().positive().optional(),
});

// Renombrar o pausar un nivel del arbol. Igual que en items, `archived` no
// esta aqui: archivar tiene su propia ruta y su propia clave de bitacora.
export const updateNodeBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'nada que actualizar' });

export const listNodesQuerySchema = z.object({
  status: z.enum(['active', 'inactive', 'archived', 'all']).default('active'),
});

export const listFamiliesQuerySchema = listNodesQuerySchema.extend({
  categoryId: z.coerce.number().int().positive().optional(),
});

export const listSubfamiliesQuerySchema = listNodesQuerySchema.extend({
  familyId: z.coerce.number().int().positive().optional(),
});

// Lo que se puede editar de un item. `archived` NO esta aqui a proposito:
// archivar es una accion con su propia ruta, su confirmacion y su clave de
// bitacora, no un valor mas de un desplegable.
export const updateItemBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    price: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/, 'Expected a decimal string')
      .optional(),
    taxRateId: z.number().int().positive().optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'nada que actualizar' });

export const listItemsQuerySchema = z.object({
  subfamilyId: z.coerce.number().int().positive().optional(),
  // Por defecto lo que se quiere ver primero. Los inactivos y los archivados
  // estan a un clic en el select del catalogo.
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
});

export const itemStationBodySchema = z.object({
  stationId: z.number().int().positive().nullable(),
});

export const kitchenStationBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    printerHost: z.string().min(1).max(255).optional(),
    printerPort: z.number().int().positive().max(65535).optional(),
  })
  // Both or neither -- a host with no port (or vice versa) isn't a printer
  // we could ever actually connect to.
  .refine((data) => (data.printerHost === undefined) === (data.printerPort === undefined), {
    message: 'printerHost and printerPort must be provided together',
  });

export const kitchenStationPrinterBodySchema = z
  .object({
    printerHost: z.string().min(1).max(255).nullable(),
    printerPort: z.number().int().positive().max(65535).nullable(),
  })
  .refine((data) => (data.printerHost === null) === (data.printerPort === null), {
    message: 'printerHost and printerPort must be set or cleared together',
  });
