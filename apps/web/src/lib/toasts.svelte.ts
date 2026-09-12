export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

// Un error se queda más tiempo en pantalla que una confirmación: el usuario
// tiene que leerlo y decidir qué hacer, no solo enterarse de que salió bien.
const DURATION: Record<ToastTone, number> = {
  success: 3500,
  info: 4000,
  error: 7000,
};

let items = $state<Toast[]>([]);
let nextId = 1;

function push(tone: ToastTone, message: string): void {
  const id = nextId++;
  items = [...items, { id, tone, message }];
  setTimeout(() => dismiss(id), DURATION[tone]);
}

function dismiss(id: number): void {
  items = items.filter((toast) => toast.id !== id);
}

/**
 * Avisos efímeros de resultado. Existe porque hoy media app hace
 * `if (response.ok) { ... }` sin rama `else`: cuando la API rechaza un
 * guardado, no pasa absolutamente nada en pantalla y el usuario cree que
 * su cambio quedó grabado.
 *
 * Regla de uso: toda mutación termina en `toasts.success(...)` o en
 * `toasts.error(...)`. Nunca en silencio.
 */
export const toasts = {
  get items() {
    return items;
  },
  success(message: string) {
    push('success', message);
  },
  error(message: string) {
    push('error', message);
  },
  info(message: string) {
    push('info', message);
  },
  dismiss,
};
