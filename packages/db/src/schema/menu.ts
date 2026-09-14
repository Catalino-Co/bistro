import { bigint, boolean, numeric, text, timestamp } from 'drizzle-orm/pg-core';
import { bistro, statusEnum } from './_shared.js';
import { taxRates } from './catalog.js';
import { kitchenStations } from './kitchen.js';

// families -> subfamilies -> categories -> items.
//
// Ese es el vocabulario del negocio: una FAMILIA (Bebidas) agrupa
// subfamilias (Refrescos), una SUBFAMILIA agrupa categorias (Gaseosas), y
// los items cuelgan de la categoria. Hasta la migracion 0021 los tres
// niveles se llamaban al reves -- categoria arriba, subfamilia abajo --,
// que era la lectura del esquema heredado y no la de quien administra el
// menu. Las filas no se movieron: solo cambio el nombre de cada nivel.
//
// Cada nivel tiene CRUD real, cosa que el sistema heredado no tenia: su
// rest_insert_category.php nunca enviaba inc_family/inc_subfamily, asi que
// los reportes podian filtrar por un nivel que nada sabia crear fuera de
// SQL.
//
// Los tres niveles del arbol y los items comparten el mismo par de estados:
//   status = 'inactive'  -> pausa. Fuera del POS, sigue en el catalogo.
//   archivedAt != null   -> retiro. Fuera del catalogo tambien, recuperable.
//
// Archivar un nivel NO escribe nada en sus hijos: lo que los oculta del POS
// es que la consulta del picker exige toda la ascendencia vendible. Asi
// restaurar una familia devuelve exactamente el estado que tenia cada
// hijo, sin tener que recordar cual ya estaba archivado por su cuenta.
export const families = bistro.table('families', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  status: statusEnum('status').notNull().default('active'),
});

export const subfamilies = bistro.table('subfamilies', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  familyId: bigint('family_id', { mode: 'number' })
    .notNull()
    .references(() => families.id),
  name: text('name').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  status: statusEnum('status').notNull().default('active'),
});

export const categories = bistro.table('categories', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  subfamilyId: bigint('subfamily_id', { mode: 'number' })
    .notNull()
    .references(() => subfamilies.id),
  name: text('name').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  status: statusEnum('status').notNull().default('active'),
});

export const items = bistro.table('items', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  categoryId: bigint('category_id', { mode: 'number' })
    .notNull()
    .references(() => categories.id),
  name: text('name').notNull(),
  price: numeric('price', { precision: 12, scale: 4 }).notNull(),
  taxRateId: bigint('tax_rate_id', { mode: 'number' })
    .notNull()
    .references(() => taxRates.id),
  // Nullable: existing items predate stations, and not every restaurant
  // wants to route everything on day one. A line for an unassigned item
  // still marks fine as "sent to kitchen" -- it just won't show up on any
  // station's ticket view.
  stationId: bigint('station_id', { mode: 'number' }).references(() => kitchenStations.id),
  // Si es `false`, el item no ofrece modificadores en el POS aunque tenga
  // grupos asociados: no todos los items llevan los mismos, y un plato que
  // no admite ninguno no deberia abrir un paso vacio al pedirlo. Se apaga y
  // se enciende sin perder que grupos tenia.
  usesModifiers: boolean('uses_modifiers').notNull().default(true),
  // Dos estados que no son lo mismo:
  //   status  = 'inactive'  -> pausa. Fuera del POS, sigue en el catálogo.
  //   archivedAt != null    -> retiro. Fuera del catálogo también, recuperable.
  //
  // Archivar NO borra: order_lines.item_id referencia esta fila, así que un
  // DELETE destruiría historial de ventas y por eso no existe. La regla que
  // acompaña a esto: los joins que resuelven nombre, precio o impuesto de
  // algo YA vendido (líneas, cuenta, totales, comandas, reportes) nunca
  // filtran por estado; solo el catálogo y el picker del POS lo hacen.
  //
  // Invariante: archivar fuerza status = 'inactive'. Es el seguro -- una
  // consulta que mire solo `status = 'active'`, incluida una escrita dentro
  // de un año por alguien que no sepa que esta columna existe, excluye los
  // archivados por su cuenta.
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  status: statusEnum('status').notNull().default('active'),
});
