import { z } from 'zod';

// El telefono y el RNC son opcionales: un huesped del hotel muchas veces no
// deja ninguno de los dos, y obligarlos solo lograria que el mesero invente
// un numero para poder seguir.
const phoneSchema = z.string().min(1).max(40);
const taxIdSchema = z.string().min(1).max(50);

export const createCustomerBodySchema = z.object({
  customerTypeId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  phone: phoneSchema.optional(),
  taxId: taxIdSchema.optional(),
});

export const updateCustomerBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    customerTypeId: z.number().int().positive().optional(),
    // `null` borra el dato; omitirlo lo deja como esta.
    phone: phoneSchema.nullable().optional(),
    taxId: taxIdSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'nada que actualizar' });

export const listCustomersQuerySchema = z.object({
  search: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'archived']).default('active'),
});
