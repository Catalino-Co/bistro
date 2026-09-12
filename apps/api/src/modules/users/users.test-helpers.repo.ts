import { db, schema } from '@bistro/db';
import { eq } from 'drizzle-orm';

// El rol `admin` lo inserta el seed de referencia; los tests necesitan su
// id para probar la asignación por sucursal.
export async function findRoleIdByName(name: string): Promise<number> {
  const [row] = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(eq(schema.roles.name, name));
  if (!row) throw new Error(`Role not found: ${name}`);
  return row.id;
}
