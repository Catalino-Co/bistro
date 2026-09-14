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
  no_receipt_printer:
    'Esta sucursal no tiene impresora de caja configurada. Se asigna en Ajustes → Sucursales.',
  print_failed: 'La impresora de caja no respondió. Revisa que esté encendida y en red.',
  room_service_not_allowed: 'Ese tipo de cliente no admite room service.',
  line_not_found: 'La línea ya no existe.',
  line_voided: 'La línea está anulada.',
  modifier_not_allowed: 'Ese modificador no aplica al ítem seleccionado.',

  // Cocina
  station_not_found: 'La estación ya no existe.',

  // Catálogo
  item_not_available: 'Ese ítem ya no está disponible para la venta. Recarga el menú.',
  item_archived: 'Ese ítem está archivado. Restáuralo antes de editarlo.',
  tax_rate_not_found: 'Ese impuesto ya no existe.',

  // Archivar: compartido por ítems, categorías y clientes.
  already_archived: 'Ya estaba archivado.',
  not_archived: 'No está archivado.',

  // Clientes
  customer_not_found: 'El cliente ya no existe.',
  customer_archived: 'Ese cliente está archivado. Restáuralo antes de editarlo.',
  customer_type_not_found: 'Ese tipo de cliente ya no existe.',

  // Usuarios y organización
  username_taken: 'Ese nombre de usuario ya está en uso.',
  user_not_found: 'El empleado ya no existe.',
  role_not_found: 'El rol ya no existe.',
  branch_not_found: 'La sucursal ya no existe.',
  company_not_found: 'La compañía ya no existe.',
  business_unit_not_found: 'La unidad de negocio ya no existe.',
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
