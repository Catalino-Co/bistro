# Bistro

POS para una cadena de restaurantes en República Dominicana. Monorepo pnpm
+ Turborepo: `apps/api` (Fastify 5 + Zod + Drizzle), `apps/web` (SvelteKit 2
/ Svelte 5 runes), `packages/db`, `packages/permissions`, `packages/config`.

## Antes de escribir interfaz

Lee **[`docs/ui-standards.md`](docs/ui-standards.md)**. En particular:
cuando un módulo tiene varias secciones, se navega con **tarjetas** desde un
índice, no con pestañas ni con columnas dentro de una sola pantalla.

## Verificación

`pnpm run ci` (= `turbo run lint test build`) tiene que quedar en verde, y
todo cambio de interfaz se recorre en el navegador antes de darlo por hecho.
Ojo: `pnpm ci` sin `run` es el alias de instalación limpia de pnpm, no el
script.

Los tests corren contra la base de desarrollo. Al limpiar datos de prueba,
**nunca** por `LIKE` con comodín: solo por ids explícitos.

## Reglas del dominio

- **El árbol del menú es `familia → subfamilia → categoría → ítem`.** Ese
  orden es el del negocio, no el del esquema heredado: hasta la migración
  0021 los tres niveles se llamaban al revés. Las filas nunca se movieron.
- **Archivar, nunca borrar** lo que tenga historial de uso. Ver
  `docs/ui-standards.md`.
- Los totales de una orden cerrada salen de sus columnas congeladas, no de
  recalcular sus líneas: si mañana cambia el ITBIS, una factura de ayer
  tiene que seguir diciendo lo que se cobró.
- Solo los ficheros `*.repo.ts` pueden importar `@bistro/db` (regla de
  ESLint).
- `exactOptionalPropertyTypes` está activo: los patches de Drizzle se arman
  con las claves definidas, nunca con un `.set({})` vacío.
