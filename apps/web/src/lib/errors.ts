/**
 * Traduce los códigos de error de la API a algo que una persona pueda leer.
 *
 * La API responde `{ error: 'table_occupied' }` porque es un contrato
 * estable entre cliente y servidor; eso no es lo que debe aparecer en
 * pantalla. Antes, cuando aparecía algo, aparecía el código crudo.
 */
const MESSAGES: Record<string, string> = {
  no_branch_selected: 'Selecciona una sucursal antes de continuar.',
  invalid_request: 'Revisa los datos: hay algo que no es válido.',
  forbidden: 'No tienes permiso para hacer esto.',

  // Salón
  table_not_found: 'La mesa ya no existe.',
  table_occupied: 'Esa mesa ya tiene una orden abierta.',
  table_has_orders: 'No se puede eliminar: la mesa tiene órdenes registradas.',
  area_has_tables: 'No se puede eliminar: el área todavía tiene mesas.',

  // Órdenes
  order_not_found: 'La orden ya no existe.',
  already_closed: 'La orden ya estaba cerrada.',
  order_closed: 'La orden está cerrada.',
  insufficient_payment: 'Falta cubrir el total antes de cerrar la orden.',
  room_service_not_allowed: 'Ese tipo de cliente no admite room service.',
  line_not_found: 'La línea ya no existe.',
  line_voided: 'La línea está anulada.',
  modifier_not_allowed: 'Ese modificador no aplica al ítem seleccionado.',

  // Cocina
  station_not_found: 'La estación ya no existe.',
};

/**
 * Lee el cuerpo de una respuesta fallida y devuelve el mensaje en español.
 * Nunca lanza: si el cuerpo no es JSON o el código es desconocido, cae al
 * texto de respaldo que le pase la pantalla.
 */
export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  const code = body?.error;
  return (code ? MESSAGES[code] : undefined) ?? fallback;
}

export function errorMessage(code: string | null | undefined, fallback: string): string {
  return (code ? MESSAGES[code] : undefined) ?? fallback;
}
