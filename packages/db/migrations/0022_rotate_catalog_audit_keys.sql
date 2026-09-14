--> Rotar tambien la bitacora, para que no mienta sobre lo que paso.
--
-- La 0021 rota los nombres de los tres niveles del arbol. Las filas de
-- `audit_log` que ya estaban escritas guardan el nombre VIEJO del nivel:
-- una fila `catalog.category_archived` registra que se archivo la raiz, que
-- entonces se llamaba categoria y hoy se llama familia. Su `entity_id`
-- sigue apuntando a la fila correcta -- ningun id cambio --, pero su
-- etiqueta diria "Categoria archivada" sobre lo que hoy es una familia.
--
-- Esto no borra historial: lo traduce al vocabulario nuevo, que es lo unico
-- que lo mantiene legible. En una base recien instalada no encuentra nada.
--
-- Otro ciclo de tres, asi que otra vez hace falta el valor temporal.
UPDATE "bistro"."audit_log" SET "action_key" = 'catalog.tmplevel_' || split_part("action_key", '_', 2)
  WHERE "action_key" LIKE 'catalog.subfamily\_%';--> statement-breakpoint
UPDATE "bistro"."audit_log" SET "action_key" = 'catalog.subfamily_' || split_part("action_key", '_', 2)
  WHERE "action_key" LIKE 'catalog.family\_%';--> statement-breakpoint
UPDATE "bistro"."audit_log" SET "action_key" = 'catalog.family_' || split_part("action_key", '_', 2)
  WHERE "action_key" LIKE 'catalog.category\_%';--> statement-breakpoint
UPDATE "bistro"."audit_log" SET "action_key" = 'catalog.category_' || split_part("action_key", '_', 2)
  WHERE "action_key" LIKE 'catalog.tmplevel\_%';--> statement-breakpoint

--> Y el tipo de entidad de esas mismas filas.
UPDATE "bistro"."audit_log" SET "entity_type" = 'tmplevel' WHERE "entity_type" = 'subfamily';--> statement-breakpoint
UPDATE "bistro"."audit_log" SET "entity_type" = 'subfamily' WHERE "entity_type" = 'family';--> statement-breakpoint
UPDATE "bistro"."audit_log" SET "entity_type" = 'family' WHERE "entity_type" = 'category';--> statement-breakpoint
UPDATE "bistro"."audit_log" SET "entity_type" = 'category' WHERE "entity_type" = 'tmplevel';
