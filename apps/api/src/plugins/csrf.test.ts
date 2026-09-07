import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { cookieValue, findCookiePair, mergeCookies } from '../test-support/http.js';

describe('csrf plugin', () => {
  it('issues a non-httpOnly csrf cookie on a plain GET', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    const rawSetCookie = response.headers['set-cookie'];
    const setCookieList = Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie];
    const csrfSetCookie = setCookieList.find((c) => c?.startsWith('csrf='));

    expect(csrfSetCookie).toBeDefined();
    expect(csrfSetCookie).not.toContain('HttpOnly');
  });

  it('rejects a mutating request with no X-CSRF-Token header even with a valid session cookie', async () => {
    const app = buildApp();
    const primed = await app.inject({ method: 'GET', url: '/health' });
    const sessionCookie = findCookiePair(primed.headers['set-cookie'], 'sessionId');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: sessionCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects a mutating request whose header does not match the csrf cookie', async () => {
    const app = buildApp();
    const primed = await app.inject({ method: 'GET', url: '/health' });
    const sessionCookie = findCookiePair(primed.headers['set-cookie'], 'sessionId');
    const csrfCookie = findCookiePair(primed.headers['set-cookie'], 'csrf');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: mergeCookies(sessionCookie, csrfCookie),
        'x-csrf-token': 'not-the-right-token',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('accepts a mutating request whose header matches the csrf cookie', async () => {
    const app = buildApp();
    const primed = await app.inject({ method: 'GET', url: '/health' });
    const sessionCookie = findCookiePair(primed.headers['set-cookie'], 'sessionId');
    const csrfCookie = findCookiePair(primed.headers['set-cookie'], 'csrf');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: mergeCookies(sessionCookie, csrfCookie),
        'x-csrf-token': cookieValue(csrfCookie),
      },
    });

    expect(response.statusCode).toBe(204);
  });
});
