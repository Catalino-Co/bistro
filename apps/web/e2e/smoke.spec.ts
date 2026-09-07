import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERNAME } from './global-setup.js';

const API_BASE_URL = 'http://localhost:3001';

function extractCsrfToken(setCookieHeaders: { name: string; value: string }[]): string {
  const csrfHeader = setCookieHeaders.find(
    (h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('csrf='),
  );
  if (!csrfHeader) {
    throw new Error('Expected a csrf Set-Cookie header');
  }
  const value = csrfHeader.value.split(';')[0]?.split('=')[1];
  if (!value) {
    throw new Error(`Malformed csrf cookie: ${csrfHeader.value}`);
  }
  return value;
}

test('web app home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});

test('login then logout against the running API', async ({ request }) => {
  // The request fixture keeps its own cookie jar across calls, so the
  // session/csrf cookies from this GET are sent automatically on the
  // following POSTs -- only the X-CSRF-Token header needs to be added by
  // hand, mirroring what a real frontend would read from document.cookie.
  const health = await request.get(`${API_BASE_URL}/health`);
  expect(health.ok()).toBe(true);
  const csrfToken = extractCsrfToken(await health.headersArray());

  const login = await request.post(`${API_BASE_URL}/auth/login`, {
    headers: { 'x-csrf-token': csrfToken },
    data: { username: E2E_USERNAME, password: E2E_PASSWORD },
  });
  expect(login.ok()).toBe(true);

  const logout = await request.post(`${API_BASE_URL}/auth/logout`, {
    headers: { 'x-csrf-token': csrfToken },
  });
  expect(logout.status()).toBe(204);
});
