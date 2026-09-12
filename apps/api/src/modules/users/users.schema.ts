import { z } from 'zod';

// La contraseña se exige de 10 caracteres para arriba, que es lo que ya
// asumen las credenciales de prueba de todo el repo. No se impone una
// composición concreta (mayúscula + número + símbolo): eso empuja a la
// gente hacia contraseñas cortas y predecibles, y aquí el freno real
// contra la fuerza bruta es el bloqueo por intentos del login.
const passwordSchema = z.string().min(10).max(255);

export const createUserBodySchema = z.object({
  username: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9._-]+$/, 'solo minúsculas, números, punto, guion y guion bajo'),
  fullName: z.string().min(1).max(255),
  password: passwordSchema,
});

export const updateUserBodySchema = z
  .object({
    fullName: z.string().min(1).max(255).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((body) => body.fullName !== undefined || body.status !== undefined, {
    message: 'nada que actualizar',
  });

export const resetPasswordBodySchema = z.object({
  password: passwordSchema,
});

export const userRoleBodySchema = z.object({
  roleId: z.number().int().positive(),
  branchId: z.number().int().positive(),
});
