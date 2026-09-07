/** Test-only helpers for juggling cookies/CSRF across multiple .inject() calls. */

export function allCookiePairs(setCookieHeader: string | string[] | undefined): string[] {
  const raws = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  return raws.map((raw) => raw.split(';')[0]!);
}

export function findCookiePair(
  setCookieHeader: string | string[] | undefined,
  name: string,
): string {
  const pair = allCookiePairs(setCookieHeader).find((p) => p.startsWith(`${name}=`));
  if (!pair) {
    throw new Error(`Expected a "${name}" cookie in set-cookie header`);
  }
  return pair;
}

export function cookieValue(cookiePair: string): string {
  const value = cookiePair.split('=')[1];
  if (!value) {
    throw new Error(`Malformed cookie pair: ${cookiePair}`);
  }
  return value;
}

export function mergeCookies(...pairs: string[]): string {
  return pairs.join('; ');
}
