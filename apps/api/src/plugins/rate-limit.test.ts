import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

describe('rate limit plugin', () => {
  it('adds rate-limit headers to every response', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
  });
});
