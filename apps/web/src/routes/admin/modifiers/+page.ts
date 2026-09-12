import { redirect } from '@sveltejs/kit';

// Ruta heredada: la pantalla se mudó a /menu/modifiers en la reorganización de
// la navegación. Se deja el redirect para no romper marcadores ni enlaces
// que ya estuvieran guardados.
export function load() {
  redirect(308, '/menu/modifiers');
}
