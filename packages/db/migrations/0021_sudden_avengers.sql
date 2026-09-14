--> Renombrar los tres niveles del arbol del menu, sin mover una sola fila.
--
-- El arbol pasa de  categoria > familia > subfamilia > item
--             a     familia   > subfamilia > categoria > item
--
-- Las filas se quedan donde estan: lo que rota es el NOMBRE de cada nivel.
-- "Bebidas" era la categoria raiz y ahora es la familia raiz; "Gaseosas"
-- era la subfamilia hoja y ahora es la categoria hoja. Por eso esto es una
-- rotacion de nombres de tabla y no un UPDATE masivo: mover las filas entre
-- tablas les cambiaria el id, y `order_lines.item_id` -> `items` ->
-- `categories` cuelga de esos ids.
--
-- La rotacion es un ciclo de tres, asi que hace falta un nombre temporal.
ALTER TABLE "bistro"."categories" RENAME TO "tmp_level_root";--> statement-breakpoint
ALTER TABLE "bistro"."families" RENAME TO "tmp_level_mid";--> statement-breakpoint
ALTER TABLE "bistro"."subfamilies" RENAME TO "categories";--> statement-breakpoint
ALTER TABLE "bistro"."tmp_level_mid" RENAME TO "subfamilies";--> statement-breakpoint
ALTER TABLE "bistro"."tmp_level_root" RENAME TO "families";--> statement-breakpoint

--> Las columnas de padre siguen a sus tablas.
ALTER TABLE "bistro"."subfamilies" RENAME COLUMN "category_id" TO "family_id";--> statement-breakpoint
ALTER TABLE "bistro"."categories" RENAME COLUMN "family_id" TO "subfamily_id";--> statement-breakpoint
ALTER TABLE "bistro"."items" RENAME COLUMN "subfamily_id" TO "category_id";--> statement-breakpoint

--> Y los nombres de las restricciones, que si no mienten sobre a que apuntan.
-- No chocan entre si: un nombre de constraint es unico por tabla, no por
-- esquema, y cada uno viaja con la tabla que acaba de cambiar de nombre.
ALTER TABLE "bistro"."subfamilies" RENAME CONSTRAINT "families_category_id_categories_id_fk" TO "subfamilies_family_id_families_id_fk";--> statement-breakpoint
ALTER TABLE "bistro"."categories" RENAME CONSTRAINT "subfamilies_family_id_families_id_fk" TO "categories_subfamily_id_subfamilies_id_fk";--> statement-breakpoint
ALTER TABLE "bistro"."items" RENAME CONSTRAINT "items_subfamily_id_subfamilies_id_fk" TO "items_category_id_categories_id_fk";--> statement-breakpoint

--> Las claves primarias tambien viajaron con su tabla, y salen por su
--> nombre cada vez que algo choca contra ellas.
--
-- Estas SI necesitan el nombre temporal aunque las de arriba no: una clave
-- primaria se apoya en un indice unico, y los nombres de indice son unicos
-- por ESQUEMA, no por tabla. Es otro ciclo de tres.
ALTER TABLE "bistro"."categories" RENAME CONSTRAINT "subfamilies_pkey" TO "tmp_level_pkey";--> statement-breakpoint
ALTER TABLE "bistro"."subfamilies" RENAME CONSTRAINT "families_pkey" TO "subfamilies_pkey";--> statement-breakpoint
ALTER TABLE "bistro"."families" RENAME CONSTRAINT "categories_pkey" TO "families_pkey";--> statement-breakpoint
ALTER TABLE "bistro"."categories" RENAME CONSTRAINT "tmp_level_pkey" TO "categories_pkey";--> statement-breakpoint

--> Las secuencias de identidad se quedan con su nombre viejo. No se
--> nombran desde ningun sitio -- Drizzle las resuelve por OID -- y
--> renombrarlas seria riesgo sin ganancia.

--> Y el interruptor de modificadores del item.
-- Por defecto `true`: es como se comportaba hasta ahora todo lo que ya
-- existe, y apagarlo es una decision por plato.
ALTER TABLE "bistro"."items" ADD COLUMN "uses_modifiers" boolean DEFAULT true NOT NULL;
