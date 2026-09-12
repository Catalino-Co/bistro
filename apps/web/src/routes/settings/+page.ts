import { redirect } from '@sveltejs/kit';

// `/settings` no es una pantalla en sí: es un contenedor. Entra por la
// primera sección que ya existe en vez de mostrar un índice vacío.
export function load() {
  redirect(307, '/settings/floor');
}
