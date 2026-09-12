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
