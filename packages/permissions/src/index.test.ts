import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from './index.js';

describe('PERMISSIONS catalog', () => {
  it('has no duplicate keys', () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry has a non-empty description', () => {
    for (const permission of PERMISSIONS) {
      expect(permission.description.length).toBeGreaterThan(0);
    }
  });
});
