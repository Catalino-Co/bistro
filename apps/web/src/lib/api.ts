const CSRF_COOKIE = 'csrf';

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Talks to the API through vite's dev proxy (see vite.config.ts) so the
 * browser only ever sees one origin -- the API's httpOnly session cookie
 * works without any CORS/cross-site cookie setup. Attaches the CSRF
 * token from the (non-httpOnly) csrf cookie on mutating requests, since
 * the API's csrf plugin requires it on everything but GET.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) {
      headers.set('x-csrf-token', csrfToken);
    }
  }
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
}

/** Primes the csrf cookie for a fresh browser session with no prior requests. */
export async function ensureCsrfCookie(): Promise<void> {
  if (readCookie(CSRF_COOKIE)) {
    return;
  }
  await apiFetch('/health');
}
